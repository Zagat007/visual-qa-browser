import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { attachRuntimeCollector, type RuntimeCollector } from '../runtime/collector.js';
import { stabilizePage } from '../deterministic-capture/stabilize.js';
import { installSafeMode } from '../security/safe-mode.js';
import { assertPublicHttpUrl } from '../security/url-policy.js';
import { classifyInteractionCandidate, isDangerousInteractionSignal } from '../interactions/policy.js';
import { redactTextForExternalEvidence, redactUrlForExternalEvidence } from '../privacy/redaction.js';

export type ScenarioStep =
  | { action: 'assertVisible'; selector: string }
  | { action: 'click'; selector: string }
  | { action: 'check'; selector: string }
  | { action: 'assertText'; selector: string; expected: string }
  | { action: 'fill'; selector: string; value: string };
export interface ScenarioInput {
  name: string;
  url: string;
  viewport: { width: number; height: number };
  steps: ScenarioStep[];
}
export interface ScenarioResult {
  id: string;
  name: string;
  url: string;
  startedAt: string;
  finishedAt: string;
  viewport: { width: number; height: number };
  status: 'PASS' | 'ISSUE' | 'PARTIAL' | 'NOT_VERIFIED';
  steps: Array<{ number: number; action: ScenarioStep['action']; selector: string; status: 'PASS' | 'ISSUE' | 'SKIPPED_SAFELY' | 'NOT_VERIFIED'; message: string; screenshotUrl?: string }>;
  traceUrl?: string;
  note: string;
}

function blockedSince(runtime: RuntimeCollector, start: number): boolean {
  return runtime.network.slice(start).some((entry) =>
    ['skipped-safely', 'policy-blocked', 'blocked-private-network', 'request-validation-failed', 'websocket-blocked'].includes(entry.kind));
}
async function waitForActuallyVisible(page: Page, selector: string): Promise<boolean> {
  const locator = page.locator(selector);
  try {
    await locator.waitFor({ state: 'visible', timeout: 3_000 });
    await locator.scrollIntoViewIfNeeded({ timeout: 3_000 });
    return await locator.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false;
      let opacity = 1;
      let current: Element | null = node;
      while (current) {
        const style = getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden') return false;
        const ownOpacity = Number.parseFloat(style.opacity || '1');
        if (Number.isFinite(ownOpacity)) opacity *= ownOpacity;
        if (opacity <= 0.01) return false;
        current = current.parentElement;
      }
      return true;
    });
  } catch {
    return false;
  }
}

async function visibleText(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((node) => {
    const pieces: string[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      const value = textNode.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const parent = textNode.parentElement;
      if (value && parent) {
        let visible = true;
        let opacity = 1;
        let current: Element | null = parent;
        while (current) {
          const style = getComputedStyle(current);
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden') { visible = false; break; }
          const ownOpacity = Number.parseFloat(style.opacity || '1');
          if (Number.isFinite(ownOpacity)) opacity *= ownOpacity;
          if (opacity <= 0.01) { visible = false; break; }
          current = current.parentElement;
        }
        if (visible) {
          const range = document.createRange();
          range.selectNodeContents(textNode);
          const onScreen = [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
          if (onScreen) pieces.push(value);
        }
      }
      textNode = walker.nextNode();
    }
    return pieces.join(' ').replace(/\s+/g, ' ').trim();
  }).catch(() => '');
}

async function waitForExpectedText(page: Page, selector: string, expected: string): Promise<boolean> {
  const deadline = Date.now() + 3_000;
  while (Date.now() <= deadline) {
    if (await waitForActuallyVisible(page, selector)) {
      const actual = await visibleText(page, selector);
      if (actual.includes(expected)) return true;
    }
    await page.waitForTimeout(100);
  }
  return false;
}

async function waitForEnabled(page: Page, selector: string): Promise<boolean> {
  const locator = page.locator(selector);
  const deadline = Date.now() + 3_000;
  while (Date.now() <= deadline) {
    if (await locator.isEnabled().catch(() => false)) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function waitForUniqueLocator(page: Page, selector: string): Promise<{ locator: ReturnType<Page['locator']>; count: number }> {
  const locator = page.locator(selector);
  const deadline = Date.now() + 3_000;
  let count = 0;
  while (Date.now() <= deadline) {
    count = await locator.count().catch(() => 0);
    if (count === 1) return { locator, count };
    if (count > 1) return { locator, count };
    await page.waitForTimeout(100);
  }
  return { locator, count };
}

export async function executeScenarioStep(page: Page, step: ScenarioStep): Promise<{ status: 'PASS' | 'ISSUE' | 'SKIPPED_SAFELY'; message: string }> {
  const resolved = await waitForUniqueLocator(page, step.selector);
  const locator = resolved.locator;
  if (resolved.count !== 1) return { status: 'ISSUE', message: resolved.count > 1
    ? `Селектор должен указывать ровно на один элемент; найдено: ${resolved.count}.`
    : 'Элемент не появился в DOM в течение 3 секунд.' };
  if (step.action === 'assertVisible') {
    return await waitForActuallyVisible(page, step.selector)
      ? { status: 'PASS', message: 'Элемент действительно видим и отрисован.' }
      : { status: 'ISSUE', message: 'Элемент не стал видимым в течение 3 секунд.' };
  }
  if (step.action === 'assertText') {
    return await waitForExpectedText(page, step.selector, step.expected)
      ? { status: 'PASS', message: 'Ожидаемый текст видим пользователю.' }
      : { status: 'ISSUE', message: 'Ожидаемый видимый текст не появился в течение 3 секунд.' };
  }
  if (!await waitForActuallyVisible(page, step.selector) || !await waitForEnabled(page, step.selector)) return { status: 'ISSUE', message: 'Элемент скрыт или не стал доступен в течение 3 секунд.' };
  const element = await locator.evaluate((node) => {
    const control = node as HTMLInputElement;
    return {
      tag: node.tagName.toLowerCase(), role: node.getAttribute('role') ?? '',
      type: control.type ?? '', text: (node.getAttribute('aria-label') ?? node.textContent ?? '').slice(0, 120),
      href: (node as HTMLAnchorElement).href ?? '', disabled: control.disabled ?? false,
      ariaExpanded: node.getAttribute('aria-expanded') ?? '', ariaControls: node.getAttribute('aria-controls') ?? '',
      readonly: control.readOnly ?? false,
      label: (node.closest('label')?.textContent ?? '').slice(0, 120),
      inForm: Boolean((node as HTMLButtonElement).form || node.closest('form')),
    };
  });
  const decision = classifyInteractionCandidate({
    ...element,
    type: element.tag === 'button' && element.type === 'submit' && !element.inForm ? 'button' : element.type,
  });
  if (step.action === 'click') {
    if (decision.classification !== 'SAFE_STATE') return { status: 'SKIPPED_SAFELY', message: decision.reason };
    await locator.click({ timeout: 3_000, noWaitAfter: true });
    return { status: 'PASS', message: 'Безопасное переключение состояния выполнено.' };
  }
  if (step.action === 'check') {
    if (element.tag !== 'input' || !['radio', 'checkbox'].includes(element.type) ||
      isDangerousInteractionSignal(element.label + ' ' + element.text) || element.readonly) {
      return { status: 'SKIPPED_SAFELY', message: 'Разрешён только обычный checkbox/radio без опасного действия.' };
    }
    await locator.check({ timeout: 3_000, noWaitAfter: true });
    return { status: 'PASS', message: 'Вариант выбран без отправки формы.' };
  }
  if (!((element.tag === 'input' && ['text', 'search'].includes(element.type)) || element.tag === 'textarea') ||
    element.readonly || isDangerousInteractionSignal(element.label + ' ' + element.text)) {
    return { status: 'SKIPPED_SAFELY', message: 'Заполнение этого поля небезопасно или не поддерживается.' };
  }
  await locator.fill(step.value, { timeout: 3_000, noWaitAfter: true });
  return { status: 'PASS', message: 'Тестовое значение введено без отправки формы.' };
}

/** Explicit, bounded public-site sequence. Safe Mode remains active for the whole browser context. */
export async function runSafeScenario(rootDir: string, input: ScenarioInput): Promise<ScenarioResult> {
  await assertPublicHttpUrl(input.url);
  const id = crypto.randomUUID();
  const output = path.join(rootDir, 'reports', 'scenarios', id);
  await fs.mkdir(output, { recursive: true });
  const startedAt = new Date().toISOString();
  const steps: ScenarioResult['steps'] = [];
  let status: ScenarioResult['status'] = 'NOT_VERIFIED';
  let traceUrl: string | undefined;
  let pageLoadBlocked = false;
  const browser = await chromium.launch({ headless: true });
  let context: import('playwright').BrowserContext;
  try {
    context = await browser.newContext({
      viewport: input.viewport, screen: input.viewport, deviceScaleFactor: 1,
      serviceWorkers: 'block', ignoreHTTPSErrors: false, reducedMotion: 'no-preference',
      acceptDownloads: false,
    });
  } catch (error) { await browser.close().catch(() => undefined); throw error; }
  let runtime: RuntimeCollector | null = null;
  let locked = false;
  const timeout = setTimeout(() => { void context.close().catch(() => undefined); }, 90_000);
  try {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    await installSafeMode(context, () => {
      if (!runtime) throw new Error('Scenario runtime is unavailable.');
      return runtime;
    }, { blockNetwork: () => locked });
    const page = await context.newPage();
    runtime = attachRuntimeCollector(page);
    page.on('dialog', (dialog) => { void dialog.dismiss().catch(() => undefined); });
    await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 35_000 });
    await stabilizePage(page);
    locked = true;
    pageLoadBlocked = blockedSince(runtime, 0);
    await page.evaluate(() => { Object.defineProperty(window, 'open', { configurable: true, value: () => null }); });
    for (const [index, step] of input.steps.entries()) {
      const record: ScenarioResult['steps'][number] = {
        number: index + 1, action: step.action, selector: step.selector, status: 'NOT_VERIFIED', message: 'Шаг не завершён.',
      };
      steps.push(record);
      const networkStart = runtime.network.length;
      try {
        const outcome = await executeScenarioStep(page, step);
        await page.waitForTimeout(120);
        record.status = outcome.status;
        record.message = outcome.message;
        if (blockedSince(runtime, networkStart)) {
          record.status = 'SKIPPED_SAFELY';
          record.message = 'Safe Mode остановил сетевое действие во время шага. Результат не подтверждён.';
        }
        if (record.status === 'PASS') {
          const name = `step-${String(index + 1).padStart(2, '0')}.png`;
          await page.screenshot({ path: path.join(output, name), animations: 'disabled' });
          record.screenshotUrl = `/reports/scenarios/${id}/${name}`;
        }
      } catch (error) {
        record.message = redactTextForExternalEvidence(error instanceof Error ? error.message : 'Ошибка шага.').slice(0, 300);
      }
      if (record.status !== 'PASS') break;
    }
    status = steps.length === input.steps.length && steps.every((step) => step.status === 'PASS') && !pageLoadBlocked ? 'PASS'
      : steps.some((step) => step.status === 'ISSUE') ? 'ISSUE'
        : pageLoadBlocked || steps.some((step) => step.status === 'SKIPPED_SAFELY') ? 'PARTIAL' : 'NOT_VERIFIED';
  } catch (error) {
    steps.push({ number: steps.length + 1, action: 'assertVisible', selector: '(запуск)', status: 'NOT_VERIFIED',
      message: redactTextForExternalEvidence(error instanceof Error ? error.message : 'Сценарий не запущен.').slice(0, 300) });
  } finally {
    clearTimeout(timeout);
    try {
      const trace = path.join(output, 'trace.zip');
      await context.tracing.stop({ path: trace });
      traceUrl = `/reports/scenarios/${id}/trace.zip`;
    } catch { /* An incomplete trace is not reported as available. */ }
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
  const result: ScenarioResult = {
    id, name: input.name, url: redactUrlForExternalEvidence(input.url), startedAt,
    finishedAt: new Date().toISOString(), viewport: input.viewport, status, steps,
    ...(traceUrl ? { traceUrl } : {}),
    note: `Сценарий выполняется в одноразовом контексте. После загрузки страницы сеть заблокирована; ссылки, submit, оплата и опасные действия не выполняются.${pageLoadBlocked ? ' При загрузке Safe Mode заблокировал запрос; полный PASS недопустим.' : ''} Trace и снимки локальные; проверьте изображения на персональные данные.`,
  };
  await fs.writeFile(path.join(output, 'scenario.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
