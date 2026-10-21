import fs from 'node:fs/promises';
import path from 'node:path';
import type { Browser, BrowserContext, BrowserContextOptions, Page } from 'playwright';
import { stabilizePage } from '../deterministic-capture/stabilize.js';
import { collectFormEvidence } from '../forms/forms.js';
import { attachRuntimeCollector, mergeRuntimeCollector, type RuntimeCollector } from '../runtime/collector.js';
import { installSafeMode } from '../security/safe-mode.js';
import { redactText, redactUrl } from '../privacy/redaction.js';
import { classifyInteractionCandidate } from './policy.js';
import type { InteractionAuditEvidence, InteractionCandidate, ViewportSpec } from '../shared/types.js';

const MAX_CANDIDATES = 80;
const MAX_EXECUTED = 24;

interface RawCandidate {
  selector: string;
  tag: string;
  role: string;
  type: string;
  text: string;
  href: string;
  disabled: boolean;
  ariaExpanded: string;
  ariaSelected: string;
  ariaControls: string;
  inForm: boolean;
}

interface InteractionPage {
  page: Page;
  runtime: RuntimeCollector;
  webSockets: { opened: number };
}

function contextOptions(viewport: ViewportSpec): BrowserContextOptions {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
  };
}

interface CandidateDiscovery {
  totalVisible: number;
  candidates: RawCandidate[];
}

async function discover(page: Page): Promise<CandidateDiscovery> {
  return page.evaluate((limit) => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('button,a[href],summary,[role="button"],[role="tab"],[aria-expanded],[aria-controls],input,select,textarea'));
    const visibleAll = nodes.filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01 && rect.width > 0 && rect.height > 0;
    });
    const visible = visibleAll.slice(0, limit);

    const escapeAttr = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    const selectorFor = (element: HTMLElement): string => {
      if (element.id) {
        const selector = `#${CSS.escape(element.id)}`;
        if (document.querySelectorAll(selector).length === 1) return selector;
      }
      const testId = element.getAttribute('data-testid');
      if (testId) {
        const selector = `[data-testid="${escapeAttr(testId)}"]`;
        if (document.querySelectorAll(selector).length === 1) return selector;
      }
      const qa = element.getAttribute('data-qa');
      if (qa) {
        const selector = `[data-qa="${escapeAttr(qa)}"]`;
        if (document.querySelectorAll(selector).length === 1) return selector;
      }
      const parts: string[] = [];
      let current: HTMLElement | null = element;
      while (current && current !== document.body && parts.length < 5) {
        const tag = current.tagName.toLowerCase();
        const parent: HTMLElement | null = current.parentElement;
        if (!parent) { parts.unshift(tag); break; }
        const sameTag = Array.from(parent.children).filter((child) => child.tagName === current!.tagName);
        const index = Math.max(0, sameTag.indexOf(current)) + 1;
        parts.unshift(`${tag}:nth-of-type(${index})`);
        current = parent;
      }
      return parts.join(' > ');
    };

    const candidates = visible.map((element) => {
      const input = element as HTMLInputElement;
      const anchor = element as HTMLAnchorElement;
      return {
        selector: selectorFor(element),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') ?? '',
        type: 'type' in input ? (input.type ?? '') : '',
        text: (element.getAttribute('aria-label') || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180),
        href: anchor.href || '',
        disabled: 'disabled' in input ? Boolean(input.disabled) : element.getAttribute('aria-disabled') === 'true',
        ariaExpanded: element.getAttribute('aria-expanded') ?? '',
        ariaSelected: element.getAttribute('aria-selected') ?? '',
        ariaControls: element.getAttribute('aria-controls') ?? '',
        inForm: Boolean(element.closest('form')),
      };
    });
    return { totalVisible: visibleAll.length, candidates };
  }, MAX_CANDIDATES);
}

async function readState(page: Page, selector: string): Promise<{ expanded: string; selected: string; controlsVisible: boolean | null }> {
  return page.locator(selector).first().evaluate((element) => {
    const controlledId = element.getAttribute('aria-controls');
    const controlled = controlledId ? document.getElementById(controlledId) : null;
    const visible = controlled ? (() => {
      const style = getComputedStyle(controlled);
      const rect = controlled.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01 && rect.width > 0 && rect.height > 0;
    })() : null;
    return {
      expanded: element.getAttribute('aria-expanded') ?? '',
      selected: element.getAttribute('aria-selected') ?? '',
      controlsVisible: visible,
    };
  });
}

function safeFilename(index: number, candidate: RawCandidate): string {
  const base = `${candidate.tag}-${candidate.role || candidate.type || 'control'}`.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 48);
  return `${String(index + 1).padStart(2, '0')}-${base || 'control'}.png`;
}

async function openInteractionPage(
  context: BrowserContext,
  targetUrl: string,
  bindRuntime: (runtime: RuntimeCollector) => Promise<void>,
  lockNetwork: () => void,
): Promise<InteractionPage> {
  const page = await context.newPage();
  const runtime = attachRuntimeCollector(page);
  const webSockets = { opened: 0 };
  page.on('websocket', () => { webSockets.opened += 1; });
  await bindRuntime(runtime);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await stabilizePage(page);
  lockNetwork();
  return { page, runtime, webSockets };
}

function blockedWebSocketCount(runtime: RuntimeCollector): number {
  return runtime.network.filter((entry) => entry.kind === 'websocket-blocked').length;
}

function interactionFirewallBlocks(runtime: RuntimeCollector, startIndex: number): number {
  return runtime.network.slice(startIndex).filter((entry) => entry.kind === 'skipped-safely' && entry.reason?.includes('Interaction activation firewall')).length;
}

export interface InteractionAuditOptions {
  inspectForms: boolean;
  testInteractions: boolean;
}

export async function runInteractionAudit(
  browser: Browser,
  targetUrl: string,
  viewport: ViewportSpec,
  outputDir: string,
  options: InteractionAuditOptions = { inspectForms: true, testInteractions: true },
): Promise<InteractionAuditEvidence> {
  const context = await browser.newContext(contextOptions(viewport));
  const screenshotsDir = path.join(outputDir, 'interactions', viewport.name);
  await fs.mkdir(screenshotsDir, { recursive: true });

  let current: InteractionPage | null = null;
  let aggregateRuntime: RuntimeCollector | null = null;
  let activeRuntime: RuntimeCollector | null = null;
  let networkLocked = false;

  await installSafeMode(context, () => {
    if (!activeRuntime) throw new Error('Interaction Safe Mode runtime is not bound.');
    return activeRuntime;
  }, { blockNetwork: () => networkLocked });

  const bindRuntime = async (runtime: RuntimeCollector): Promise<void> => {
    activeRuntime = runtime;
    networkLocked = false;
  };

  const closeCurrent = async (): Promise<void> => {
    if (!current) return;
    await current.page.close().catch(() => undefined);
    if (!aggregateRuntime) aggregateRuntime = current.runtime;
    else if (aggregateRuntime !== current.runtime) mergeRuntimeCollector(aggregateRuntime, current.runtime);
    current = null;
  };

  const ensurePage = async (): Promise<InteractionPage> => {
    if (!current) current = await openInteractionPage(context, targetUrl, bindRuntime, () => { networkLocked = true; });
    return current;
  };

  try {
    const first = await ensurePage();
    const forms = options.inspectForms
      ? await collectFormEvidence(first.page)
      : {
          totalForms: 0,
          totalFields: 0,
          formsTruncated: false,
          fieldsTruncated: false,
          forms: [],
          fields: [],
          findings: [],
        };
    const discovery = options.testInteractions ? await discover(first.page) : { totalVisible: 0, candidates: [] };
    const rawCandidates = discovery.candidates;
    const candidates: InteractionCandidate[] = [];
    let executed = 0;

    for (let index = 0; index < rawCandidates.length; index += 1) {
      const raw = rawCandidates[index];
      if (!raw) continue;
      const decision = classifyInteractionCandidate(raw);
      const base: InteractionCandidate = {
        selector: raw.selector,
        kind: raw.role || raw.type || raw.tag,
        label: redactText(raw.text),
        classification: decision.classification,
        reason: decision.reason,
        hoverTested: false,
        focusTested: false,
        activationTested: false,
        stateChanged: false,
      };

      if (decision.classification === 'SKIPPED_SAFELY') {
        candidates.push(base);
        continue;
      }

      let resetAfterCandidate = false;
      try {
        const active = await ensurePage();
        if (active.webSockets.opened > 0) {
          base.classification = 'SKIPPED_SAFELY';
          base.reason = `Active WebSocket detected during page load (${active.webSockets.opened}); automatic interaction is not proven side-effect free.`;
          candidates.push(base);
          continue;
        }
        const locator = active.page.locator(raw.selector).first();
        const networkStart = active.runtime.network.length;
        const blockedWebSocketsStart = blockedWebSocketCount(active.runtime);
        await locator.hover({ timeout: 2_000 });
        base.hoverTested = true;
        await locator.focus({ timeout: 2_000 });
        base.focusTested = await locator.evaluate((element) => document.activeElement === element);
        await active.page.waitForTimeout(80);

        const preActivationBlocks = interactionFirewallBlocks(active.runtime, networkStart);
        const preActivationWebSockets = blockedWebSocketCount(active.runtime) - blockedWebSocketsStart;
        if (preActivationBlocks > 0 || preActivationWebSockets > 0) {
          base.classification = 'SKIPPED_SAFELY';
          base.reason = `Hover/focus attempted network activity; HTTP blocks=${preActivationBlocks}, WebSocket blocks=${preActivationWebSockets}.`;
        } else if (decision.classification === 'SAFE_STATE' && executed >= MAX_EXECUTED) {
          base.classification = 'SKIPPED_SAFELY';
          base.reason = `Automatic activation limit (${MAX_EXECUTED}) reached; activation remains NOT VERIFIED.`;
        } else if (decision.classification === 'SAFE_STATE') {
          const before = await readState(active.page, raw.selector);
          await active.page.evaluate(() => {
            Object.defineProperty(window, 'open', { configurable: true, value: () => null });
          });
          const activationStart = active.runtime.network.length;
          const activationWebSocketStart = blockedWebSocketCount(active.runtime);
          await locator.click({ timeout: 3_000, noWaitAfter: true });
          await active.page.waitForTimeout(180);
          base.activationTested = true;
          const activationBlocks = interactionFirewallBlocks(active.runtime, activationStart);
          const activationWebSockets = blockedWebSocketCount(active.runtime) - activationWebSocketStart;
          if (activationBlocks > 0 || activationWebSockets > 0) {
            base.classification = 'SKIPPED_SAFELY';
            base.reason = `Activation attempted network activity; HTTP blocks=${activationBlocks}, WebSocket blocks=${activationWebSockets}.`;
          } else {
            const after = await readState(active.page, raw.selector);
            base.stateChanged = before.expanded !== after.expanded || before.selected !== after.selected || before.controlsVisible !== after.controlsVisible;
            const screenshotPath = path.join(screenshotsDir, safeFilename(executed, raw));
            await active.page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
            base.screenshotPath = screenshotPath;
          }
          executed += 1;
          resetAfterCandidate = true;
        }
      } catch (error) {
        base.error = redactText(error instanceof Error ? error.message : 'Unknown interaction error');
        if (decision.classification === 'SAFE_STATE') resetAfterCandidate = true;
      } finally {
        if (resetAfterCandidate) await closeCurrent();
      }
      candidates.push(base);
    }

    await closeCurrent();
    if (!aggregateRuntime) throw new Error('Interaction runtime evidence was not initialized.');

    return {
      viewport,
      pageUrl: redactUrl(targetUrl),
      discovered: discovery.totalVisible,
      sampledCandidates: candidates.length,
      discoveryTruncated: discovery.totalVisible > candidates.length,
      activationLimitReached: candidates.some((item) => item.reason.includes('activation limit')),
      testedHover: candidates.filter((item) => item.hoverTested).length,
      testedFocus: candidates.filter((item) => item.focusTested).length,
      testedActivation: candidates.filter((item) => item.activationTested).length,
      skippedSafely: candidates.filter((item) => item.classification === 'SKIPPED_SAFELY').length,
      failed: candidates.filter((item) => Boolean(item.error)).length,
      candidates,
      forms,
      runtime: aggregateRuntime,
    };
  } finally {
    await closeCurrent();
    await context.close();
  }
}
