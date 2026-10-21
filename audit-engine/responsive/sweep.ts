import fs from 'node:fs/promises';
import path from 'node:path';
import type { Browser, BrowserContextOptions } from 'playwright';
import { attachRuntimeCollector } from '../runtime/collector.js';
import { installSafeMode } from '../security/safe-mode.js';
import { stabilizePage, waitForLayoutStability } from '../deterministic-capture/stabilize.js';
import { captureScreenshotWithRetry } from '../deterministic-capture/capture.js';
import { redactText, redactUrl } from '../privacy/redaction.js';
import type { ResponsiveEvidence, ResponsiveFinding, ResponsiveSample } from '../shared/types.js';

interface SweepConfig {
  enabledPreset: 'DEEP';
  start: number;
  end: number;
  step: number;
  height: number;
  settleMs: number;
}

function validateConfig(config: SweepConfig): void {
  for (const [key, value] of Object.entries({ start: config.start, end: config.end, step: config.step, height: config.height, settleMs: config.settleMs })) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`Invalid responsive sweep ${key}: ${value}`);
  }
  if (config.start < 240 || config.end > 7680 || config.start >= config.end) throw new Error('Invalid responsive sweep range.');
  if (config.step < 10 || config.step > 200) throw new Error('Responsive sweep step must be between 10 and 200 pixels.');
}

export function analyzeResponsiveSamples(samples: ResponsiveSample[]): ResponsiveFinding[] {
  const findings: ResponsiveFinding[] = [];
  for (const sample of samples) {
    if (sample.horizontalOverflowPx > 2) {
      findings.push({
        rule: 'responsive-overflow',
        confidence: 'HIGH',
        fromWidth: sample.width,
        toWidth: sample.width,
        message: `Horizontal overflow is ${sample.horizontalOverflowPx}px at ${sample.width}px.`,
      });
    }
  }
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current) continue;
    if (Math.abs(current.h1MaxLines - previous.h1MaxLines) > 1) {
      findings.push({
        rule: 'heading-line-jump',
        confidence: 'LOW',
        fromWidth: previous.width,
        toWidth: current.width,
        message: `H1 max line estimate changed from ${previous.h1MaxLines} to ${current.h1MaxLines}. Candidate for visual review.`,
      });
    }
    const heightRatio = Math.max(current.documentHeight, previous.documentHeight) / Math.max(1, Math.min(current.documentHeight, previous.documentHeight));
    if (heightRatio > 1.35) {
      findings.push({
        rule: 'document-height-jump',
        confidence: 'LOW',
        fromWidth: previous.width,
        toWidth: current.width,
        message: `Document height changed by ${((heightRatio - 1) * 100).toFixed(1)}%. Candidate for breakpoint review.`,
      });
    }
    if (Math.abs(current.mainWidth - previous.mainWidth) > Math.max(140, Math.abs(current.width - previous.width) * 3)) {
      findings.push({
        rule: 'container-width-jump',
        confidence: 'LOW',
        fromWidth: previous.width,
        toWidth: current.width,
        message: `Main container width changed from ${previous.mainWidth}px to ${current.mainWidth}px. Candidate for breakpoint review.`,
      });
    }
  }
  return findings.slice(0, 250);
}

export async function runResponsiveSweep(browser: Browser, rootDir: string, targetUrl: string, outputDir: string, signal?: AbortSignal): Promise<ResponsiveEvidence> {
  const config = JSON.parse(await fs.readFile(path.join(rootDir, 'configs', 'responsive-sweep.json'), 'utf8')) as SweepConfig;
  validateConfig(config);
  const contextOptions: BrowserContextOptions = {
    viewport: { width: config.start, height: config.height },
    screen: { width: config.start, height: config.height },
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  };
  const context = await browser.newContext(contextOptions);
  let runtime: ReturnType<typeof attachRuntimeCollector> | null = null;
  await installSafeMode(context, () => {
    if (!runtime) throw new Error('Responsive Safe Mode runtime is not bound.');
    return runtime;
  });
  try {
    const page = await context.newPage();
    runtime = attachRuntimeCollector(page);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await stabilizePage(page);
    const samples: ResponsiveSample[] = [];
    const unstableWidths: number[] = [];
    for (let width = config.start; width <= config.end; width += config.step) {
      await page.setViewportSize({ width, height: config.height });
      await page.waitForTimeout(config.settleMs);
      const stable = await waitForLayoutStability(page, { maxSamples: 5, intervalMs: 80, requiredStableSamples: 2 });
      if (!stable) unstableWidths.push(width);
      const sample = await page.evaluate((sampleWidth) => {
        const root = document.documentElement;
        const body = document.body;
        const documentWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
        const documentHeight = Math.max(root.scrollHeight, body?.scrollHeight ?? 0);
        const main = document.querySelector('main') as HTMLElement | null;
        const mainWidth = main ? Math.round(main.getBoundingClientRect().width) : 0;
        const estimateLines = (selector: string): number => {
          let max = 0;
          for (const element of Array.from(document.querySelectorAll(selector)).slice(0, 40)) {
            const html = element as HTMLElement;
            const rect = html.getBoundingClientRect();
            const lineHeightRaw = getComputedStyle(html).lineHeight;
            const lineHeight = Number.parseFloat(lineHeightRaw);
            if (rect.height <= 0 || !Number.isFinite(lineHeight) || lineHeight <= 0) continue;
            max = Math.max(max, Math.max(1, Math.round(rect.height / lineHeight)));
          }
          return max;
        };
        return {
          width: sampleWidth,
          documentWidth,
          documentHeight,
          horizontalOverflowPx: Math.max(0, documentWidth - sampleWidth),
          mainWidth,
          h1MaxLines: estimateLines('h1'),
          h2MaxLines: estimateLines('h2'),
        };
      }, width);
      samples.push(sample);
    }
    const findings = analyzeResponsiveSamples(samples);
    // A sweep measurement alone is not a screenshot-backed defect. Re-measure
    // each overflow width in the same guarded context and record exact pixels.
    for (const finding of findings.filter((item) => item.rule === 'responsive-overflow' && item.confidence === 'HIGH')) {
      signal?.throwIfAborted();
      const width = finding.fromWidth;
      try {
        await page.setViewportSize({ width, height: config.height });
        await page.waitForTimeout(config.settleMs);
        const stable = await waitForLayoutStability(page, { maxSamples: 5, intervalMs: 80, requiredStableSamples: 2 });
        if (!stable) {
          finding.verification = { status: 'NOT_VERIFIED', width, measuredOverflowPx: null, reason: 'Layout did not stabilize on repeat.' };
          continue;
        }
        const measuredOverflowPx = await page.evaluate((w) => Math.max(0,
          Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) - w), width);
        if (measuredOverflowPx <= 2) {
          finding.verification = { status: 'NOT_REPRODUCED', width, measuredOverflowPx, reason: 'Overflow did not recur on repeat.' };
          continue;
        }
        const screenshot = await captureScreenshotWithRetry(page, path.join(outputDir, 'responsive', `width-${width}.png`));
        finding.verification = {
          status: 'CONFIRMED', width, measuredOverflowPx,
          screenshotPath: screenshot.screenshotPath, capturedAt: screenshot.capturedAt,
          finalUrl: redactUrl(page.url()),
        };
      } catch (error) {
        signal?.throwIfAborted();
        finding.verification = { status: 'NOT_VERIFIED', width, measuredOverflowPx: null,
          reason: error instanceof Error ? redactText(error.message).slice(0, 300) : 'Verification failed.' };
      }
    }
    return {
      start: config.start,
      end: config.end,
      step: config.step,
      height: config.height,
      widthOnly: true,
      samples,
      findings,
      unstableWidths,
      policyBlockedRequests: runtime.network.filter((entry) => entry.kind === 'skipped-safely' || entry.kind === 'blocked-private-network' || entry.kind === 'policy-blocked' || entry.kind === 'request-validation-failed' || entry.kind === 'websocket-blocked').length,
      validationFailedRequests: runtime.network.filter((entry) => entry.kind === 'request-validation-failed').length,
    };
  } finally {
    await context.close();
  }
}
