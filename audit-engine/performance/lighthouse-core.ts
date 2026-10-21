import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import lighthouse, { desktopConfig } from 'lighthouse';
import puppeteer, { type Browser as PuppeteerBrowser } from 'puppeteer-core';
import { chromium, type BrowserContext, type Page, type Route } from 'playwright';
import { assertPublicHttpUrl, evaluateBrowserRequest, isPotentiallyDestructiveGetUrl } from '../security/url-policy.js';
import { redactText, redactUrl } from '../privacy/redaction.js';
import type {
  PerformanceEvidence,
  PerformanceMetricSet,
  PerformanceRunEvidence,
  PerformanceRunStatus,
} from '../shared/types.js';
import { medianNullable } from './statistics.js';
import { abortable, bounded, createOwnedChrome, cleanupOwnedChrome } from './lifecycle.js';

import { COLD_RUNS, RUN_TIMEOUT_MS, type PerformanceRunOptions, type PerformanceRunProgress } from './lighthouse-contract.js';
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface LighthouseAuditLike {
  numericValue?: number;
  displayValue?: string;
  details?: {
    items?: Array<Record<string, unknown>>;
  };
}

interface LighthouseResultLike {
  finalDisplayedUrl?: string;
  fetchTime?: string;
  lighthouseVersion?: string;
  runtimeError?: { code?: string; message?: string };
  categories?: { performance?: { score?: number | null } };
  audits?: Record<string, LighthouseAuditLike | undefined>;
}

interface NetworkGuardState {
  blockedMutationRequests: number;
  blockedPolicyRequests: number;
  blockedWebSockets: number;
  serviceWorkerBypassPages: number;
  serviceWorkerBypassErrors: string[];
}

function metricValue(audits: LighthouseResultLike['audits'], id: string): number | null {
  const value = audits?.[id]?.numericValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metricSet(lhr: LighthouseResultLike): PerformanceMetricSet {
  return {
    performanceScore: typeof lhr.categories?.performance?.score === 'number'
      ? Math.round(lhr.categories.performance.score * 1000) / 10
      : null,
    lcpMs: metricValue(lhr.audits, 'largest-contentful-paint'),
    cls: metricValue(lhr.audits, 'cumulative-layout-shift'),
    fcpMs: metricValue(lhr.audits, 'first-contentful-paint'),
    ttfbMs: metricValue(lhr.audits, 'server-response-time'),
    speedIndexMs: metricValue(lhr.audits, 'speed-index'),
    totalBlockingTimeMs: metricValue(lhr.audits, 'total-blocking-time'),
  };
}

function measurementSanity(metrics: PerformanceMetricSet, resources: { requestCount: number | null; transferBytes: number | null }, elapsedMs: number, timeoutMs: number): PerformanceRunEvidence['sanity'] {
  const reasons: string[] = [];
  const toleranceMs = 5_000;
  const coreMetrics: Array<[string, number | null]> = [
    ['Performance Score', metrics.performanceScore],
    ['FCP', metrics.fcpMs],
    ['LCP', metrics.lcpMs],
    ['CLS', metrics.cls],
    ['Speed Index', metrics.speedIndexMs],
    ['Total Blocking Time', metrics.totalBlockingTimeMs],
  ];
  for (const [name, value] of coreMetrics) {
    if (value === null || !Number.isFinite(value)) reasons.push(`${name} is missing or non-finite.`);
  }
  const paintMetrics: Array<[string, number | null]> = [
    ['FCP', metrics.fcpMs],
    ['LCP', metrics.lcpMs],
    ['Speed Index', metrics.speedIndexMs],
  ];
  for (const [name, value] of paintMetrics) {
    if (value === null) continue;
    if (value < 0) reasons.push(`${name} is negative (${value} ms).`);
    if (value > elapsedMs + toleranceMs) reasons.push(`${name} (${Math.round(value)} ms) exceeds observed run wall time (${Math.round(elapsedMs)} ms).`);
    if (value > timeoutMs + toleranceMs) reasons.push(`${name} (${Math.round(value)} ms) exceeds the configured run timeout (${timeoutMs} ms).`);
  }
  if (metrics.fcpMs !== null && metrics.lcpMs !== null && metrics.fcpMs > metrics.lcpMs + 1) {
    reasons.push(`FCP (${Math.round(metrics.fcpMs)} ms) occurs after LCP (${Math.round(metrics.lcpMs)} ms).`);
  }
  if (metrics.performanceScore !== null && (metrics.performanceScore < 0 || metrics.performanceScore > 100)) {
    reasons.push(`Performance Score is outside 0-100 (${metrics.performanceScore}).`);
  }
  for (const [name, value] of [['TTFB', metrics.ttfbMs], ['Total Blocking Time', metrics.totalBlockingTimeMs]] as Array<[string, number | null]>) {
    if (value !== null && value < 0) reasons.push(`${name} is negative (${value} ms).`);
  }
  if (metrics.cls !== null && metrics.cls < 0) reasons.push(`CLS is negative (${metrics.cls}).`);
  if (resources.requestCount !== null && (!Number.isInteger(resources.requestCount) || resources.requestCount < 0)) {
    reasons.push(`Resource request count is invalid (${resources.requestCount}).`);
  }
  if (resources.transferBytes !== null && resources.transferBytes < 0) {
    reasons.push(`Resource transfer bytes are negative (${resources.transferBytes}).`);
  }
  return { status: reasons.length === 0 ? 'PASS' : 'SUSPECT', reasons, elapsedMs: Math.round(elapsedMs) };
}

function resourceSummary(lhr: LighthouseResultLike): { requestCount: number | null; transferBytes: number | null } {
  const items = lhr.audits?.['resource-summary']?.details?.items;
  if (!Array.isArray(items)) return { requestCount: null, transferBytes: null };
  const total = items.find((item) => item.resourceType === 'total');
  if (!total) return { requestCount: null, transferBytes: null };
  return {
    requestCount: typeof total.requestCount === 'number' && Number.isFinite(total.requestCount) ? total.requestCount : null,
    transferBytes: typeof total.transferSize === 'number' && Number.isFinite(total.transferSize) ? total.transferSize : null,
  };
}

function medianMetrics(runs: PerformanceRunEvidence[]): PerformanceMetricSet {
  const valid = runs.filter((run) => run.status === 'PASS');
  return {
    performanceScore: medianNullable(valid.map((run) => run.metrics.performanceScore)),
    lcpMs: medianNullable(valid.map((run) => run.metrics.lcpMs)),
    cls: medianNullable(valid.map((run) => run.metrics.cls)),
    fcpMs: medianNullable(valid.map((run) => run.metrics.fcpMs)),
    ttfbMs: medianNullable(valid.map((run) => run.metrics.ttfbMs)),
    speedIndexMs: medianNullable(valid.map((run) => run.metrics.speedIndexMs)),
    totalBlockingTimeMs: medianNullable(valid.map((run) => run.metrics.totalBlockingTimeMs)),
  };
}

async function configurePageNetworkGuard(page: Page, state: NetworkGuardState, configured: WeakSet<Page>): Promise<void> {
  if (configured.has(page)) return;
  try {
    const session = await page.context().newCDPSession(page);
    await session.send('Network.setBypassServiceWorker', { bypass: true });
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    configured.add(page);
    state.serviceWorkerBypassPages += 1;
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : 'Unknown CDP network-guard failure');
    state.serviceWorkerBypassErrors.push(message);
    throw new Error(`Could not establish the Lighthouse page network guard: ${message}`);
  }
}

async function installPerformanceSafeMode(context: BrowserContext, state: NetworkGuardState): Promise<(page: Page) => Promise<void>> {
  const configured = new WeakSet<Page>();
  const decide = (rawUrl: string) => evaluateBrowserRequest(rawUrl);

  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    let page: Page | null = null;
    try {
      page = request.frame().page();
    } catch {
      page = null;
    }
    if (!page || !configured.has(page)) {
      // Never await a foreign target's initialization from its paused first
      // navigation. Only the preconfigured shared Lighthouse page may proceed.
      state.blockedPolicyRequests += 1;
      state.serviceWorkerBypassErrors.push('Blocked navigation from an unprepared Lighthouse page.');
      await route.abort('blockedbyclient');
      return;
    }

    const decision = await decide(request.url());
    if (!decision.allowed) {
      state.blockedPolicyRequests += 1;
      await route.abort('blockedbyclient');
      return;
    }

    if (['GET', 'HEAD'].includes(request.method().toUpperCase()) && isPotentiallyDestructiveGetUrl(request.url())) {
      state.blockedPolicyRequests += 1;
      await route.abort('blockedbyclient');
      return;
    }

    if (!ALLOWED_METHODS.has(request.method().toUpperCase())) {
      state.blockedMutationRequests += 1;
      await route.abort('blockedbyclient');
      return;
    }

    await route.continue();
  });

  await context.routeWebSocket('**/*', (webSocket) => {
    state.blockedWebSockets += 1;
    void webSocket.close({ code: 1008, reason: 'Blocked by Visual QA Browser Safe Mode' }).catch(() => undefined);
  });

  for (const page of context.pages()) {
    await configurePageNetworkGuard(page, state, configured);
  }
  return (page) => configurePageNetworkGuard(page, state, configured);
}

function emptyMetrics(): PerformanceMetricSet {
  return {
    performanceScore: null,
    lcpMs: null,
    cls: null,
    fcpMs: null,
    ttfbMs: null,
    speedIndexMs: null,
    totalBlockingTimeMs: null,
  };
}

function scalarRecord(value: unknown): Record<string, number | string | boolean | null> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number | string | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || typeof item === 'number' || typeof item === 'string' || typeof item === 'boolean') {
      result[key] = item;
    }
  }
  return result;
}

function lighthouseDesktopProfile(): PerformanceEvidence['profile'] {
  const settings = desktopConfig.settings ?? {};
  return {
    config: 'lighthouse:desktopConfig',
    throttlingMethod: typeof settings.throttlingMethod === 'string' ? settings.throttlingMethod : 'unknown',
    throttling: scalarRecord(settings.throttling),
    screenEmulation: scalarRecord(settings.screenEmulation),
  };
}

async function runOneColdLighthouse(options: PerformanceRunOptions, runNumber: number): Promise<PerformanceRunEvidence> {
  options.signal?.throwIfAborted();
  const startedAt = new Date().toISOString();
  const runDir = path.join(options.outputDir, 'performance');
  const state: NetworkGuardState = {
    blockedMutationRequests: 0,
    blockedPolicyRequests: 0,
    blockedWebSockets: 0,
    serviceWorkerBypassPages: 0,
    serviceWorkerBypassErrors: [],
  };

  const chromePath = options.chromePath ?? chromium.executablePath();
  const setupSignal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  const profile = await abortable(async () => {
    const created = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-lighthouse-'));
    if (setupSignal.aborted) await bounded(() => fs.rm(created, { recursive: true, force: true }), 5000);
    return created;
  }, setupSignal);
  const { launcher: chrome, closeLogFiles } = createOwnedChrome({
    chromePath, userDataDir: profile,
    chromeFlags: ['--headless=new', '--no-first-run', '--no-default-browser-check'],
    handleSIGINT: false, logLevel: 'silent',
  });
  let cdpBrowser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
  let lighthouseBrowser: PuppeteerBrowser | null = null;
  let chromeVersion = '';
  const deadline = new AbortController();
  const timeoutMs = options.runTimeoutMs ?? RUN_TIMEOUT_MS;
  const timer = setTimeout(() => deadline.abort(new Error(`Lighthouse run ${runNumber}/${COLD_RUNS} timed out after ${timeoutMs} ms. Performance was not verified.`)), timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
  const startedMs = Date.now();
  let phase: PerformanceRunProgress['phase'] = 'launch';
  let active = true;
  let progressChain = Promise.resolve();
  let evidence: PerformanceRunEvidence | undefined;
  let cleanup: Promise<string[]> | undefined;
  const clean = () => cleanup ??= cleanupOwnedChrome(chrome, cdpBrowser, profile, closeLogFiles);
  const abortChrome = (): void => { void clean().catch(() => undefined); };
  const pulse = () => {
    const snapshot: PerformanceRunProgress = { run: runNumber, totalRuns: COLD_RUNS, phase, elapsedMs: Date.now() - startedMs, timeoutMs };
    progressChain = progressChain.then(async () => { if (active && !signal.aborted) await options.onRunProgress?.(snapshot); });
    void progressChain.catch((error: unknown) => { if (!deadline.signal.aborted) deadline.abort(error); });
    return progressChain;
  };
  const heartbeat = setInterval(() => { void pulse(); }, 1000);
  signal.addEventListener('abort', abortChrome, { once: true });

  try {
    await abortable(pulse, signal);
    await abortable(async () => {
      try { await chrome.launch(); }
      finally { if (signal.aborted) await clean(); }
    }, signal);
    const port = chrome.port;
    if (port === undefined) throw new Error('Chrome did not publish a debugging port.');

    phase = 'connect';
    await abortable(pulse, signal);
    cdpBrowser = await abortable(async () => {
      const connected = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 30_000 });
      if (signal.aborted) await bounded(() => connected.close(), 5000).catch(() => undefined);
      return connected;
    }, signal);
    chromeVersion = cdpBrowser.version();
    const context = cdpBrowser.contexts()[0];
    if (!context) throw new Error('Chrome launched without a default browser context.');
    phase = 'guard';
    await abortable(pulse, signal);
    const configurePage = await abortable(() => installPerformanceSafeMode(context, state), signal);
    // Lighthouse creating its own target can pause the first navigation while
    // Playwright's request handler waits for that foreign page to initialize.
    // Create and fully guard the shared target before handing it to Lighthouse.
    const page = await abortable(() => context.newPage(), signal);
    await abortable(() => configurePage(page), signal);
    const pageMarker = `about:blank#vqb-lighthouse-${runNumber}`;
    await abortable(() => page.goto(pageMarker), signal);
    lighthouseBrowser = await abortable(async () => {
      const connected = await puppeteer.connect({ browserURL: `http://127.0.0.1:${port}`, protocolTimeout: 30_000 });
      if (signal.aborted) await bounded(() => connected.disconnect(), 5000).catch(() => undefined);
      return connected;
    }, signal);
    const pages = await abortable(() => lighthouseBrowser!.pages(), signal);
    const lighthousePage = pages.find((candidate) => candidate.url() === pageMarker);
    if (!lighthousePage) throw new Error('Lighthouse could not attach to the prepared Safe Mode page.');

    signal.throwIfAborted();
    phase = 'measure';
    await abortable(pulse, signal);
    const runnerResult = await abortable(() => lighthouse(options.url, {
      port,
      output: 'html',
      logLevel: 'error',
      onlyCategories: ['performance'],
    }, desktopConfig, lighthousePage), signal);
    if (!runnerResult) throw new Error('Lighthouse returned no runner result.');

    signal.throwIfAborted();
    phase = 'save';
    await abortable(pulse, signal);
    const reportHtml = Array.isArray(runnerResult.report) ? runnerResult.report.join('\n') : runnerResult.report;
    if (typeof reportHtml === 'string') {
      await abortable(() => fs.writeFile(path.join(runDir, `run-${runNumber}.html`), reportHtml, 'utf8'), signal);
    }

    const lhr = runnerResult.lhr as LighthouseResultLike;
    if (lhr.runtimeError) {
      throw new Error(`Lighthouse runtime error ${lhr.runtimeError.code ?? 'UNKNOWN'}: ${lhr.runtimeError.message ?? 'No message'}`);
    }
    const resources = resourceSummary(lhr);
    const metrics = metricSet(lhr);
    const sanity = measurementSanity(metrics, resources, Date.now() - startedMs, timeoutMs);
    const safetyInterference = state.blockedMutationRequests > 0 || state.blockedPolicyRequests > 0 || state.blockedWebSockets > 0;
    const guardVerified = state.serviceWorkerBypassErrors.length === 0 && state.serviceWorkerBypassPages > 0;
    const status: PerformanceRunStatus = guardVerified && metrics.performanceScore !== null && sanity.status === 'PASS' ? 'PASS' : 'NOT_VERIFIED';
    const measurementPath = path.join(runDir, `run-${runNumber}-measurement.json`);
    const coreAudits = ['largest-contentful-paint', 'cumulative-layout-shift', 'first-contentful-paint', 'server-response-time', 'speed-index', 'total-blocking-time', 'resource-summary'];
    await abortable(() => fs.writeFile(measurementPath, `${JSON.stringify({
      run: runNumber,
      fetchTime: lhr.fetchTime ?? null,
      finalDisplayedUrl: redactUrl(lhr.finalDisplayedUrl ?? options.url),
      lighthouseVersion: lhr.lighthouseVersion ?? 'unknown',
      runtimeError: lhr.runtimeError ?? null,
      performanceScore: lhr.categories?.performance?.score ?? null,
      audits: Object.fromEntries(coreAudits.map((id) => [id, lhr.audits?.[id] ?? null])),
      metrics,
      resources,
      sanity,
    }, null, 2)}\n`, 'utf8'), signal);

    evidence = {
      run: runNumber,
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      finalUrl: redactUrl(lhr.finalDisplayedUrl ?? options.url),
      lighthouseVersion: lhr.lighthouseVersion ?? 'unknown',
      chromeVersion,
      cacheState: 'COLD_FRESH_PROFILE',
      formFactor: 'desktop',
      metrics,
      resources,
      sanity,
      safety: {
        safeMode: true,
        allowedMethods: [...ALLOWED_METHODS],
        blockedMutationRequests: state.blockedMutationRequests,
        blockedPolicyRequests: state.blockedPolicyRequests,
        blockedWebSockets: state.blockedWebSockets,
        serviceWorkerBypassPages: state.serviceWorkerBypassPages,
        serviceWorkerBypassErrors: state.serviceWorkerBypassErrors,
        safetyInterference,
        guardVerified,
      },
      reportPath: path.join(runDir, `run-${runNumber}.html`),
      measurementPath,
    };
    return evidence;
  } catch (error) {
    options.signal?.throwIfAborted();
    evidence = {
      run: runNumber,
      status: 'FAILED',
      startedAt,
      finishedAt: new Date().toISOString(),
      finalUrl: redactUrl(options.url),
      lighthouseVersion: 'unknown',
      chromeVersion,
      cacheState: 'COLD_FRESH_PROFILE',
      formFactor: 'desktop',
      metrics: emptyMetrics(),
      resources: { requestCount: null, transferBytes: null },
      sanity: { status: 'SUSPECT', reasons: ['Lighthouse run failed before a trustworthy measurement completed.'], elapsedMs: Math.round(Date.now() - startedMs) },
      safety: {
        safeMode: true,
        allowedMethods: [...ALLOWED_METHODS],
        blockedMutationRequests: state.blockedMutationRequests,
        blockedPolicyRequests: state.blockedPolicyRequests,
        blockedWebSockets: state.blockedWebSockets,
        serviceWorkerBypassPages: state.serviceWorkerBypassPages,
        serviceWorkerBypassErrors: state.serviceWorkerBypassErrors,
        safetyInterference: state.blockedMutationRequests > 0 || state.blockedPolicyRequests > 0 || state.blockedWebSockets > 0,
        guardVerified: false,
      },
      error: redactText(error instanceof Error ? error.message : 'Unknown Lighthouse run failure'),
    };
    return evidence;
  } finally {
    active = false;
    clearInterval(heartbeat);
    clearTimeout(timer);
    signal.removeEventListener('abort', abortChrome);
    // Begin owned-process termination before waiting for either CDP client.
    const cleanupPromise = clean();
    if (lighthouseBrowser) await bounded(() => lighthouseBrowser!.disconnect(), 5000).catch(() => undefined);
    const cleanupErrors = await cleanupPromise;
    if (evidence) {
      evidence.finishedAt = new Date().toISOString();
      if (cleanupErrors.length > 0) {
        evidence.status = 'FAILED';
        evidence.error = redactText([evidence.error, ...cleanupErrors].filter(Boolean).join('; '));
      }
    }
  }
}

export async function runPerformanceAuditInProcess(options: PerformanceRunOptions): Promise<PerformanceEvidence> {
  options.signal?.throwIfAborted();
  if (options.runTimeoutMs !== undefined && (!Number.isFinite(options.runTimeoutMs) || options.runTimeoutMs <= 0)) throw new Error('Invalid Lighthouse run timeout.');
  const preflightSignal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
    : AbortSignal.timeout(15_000);
  const requested = await abortable(() => assertPublicHttpUrl(options.url), preflightSignal);
  const outputDir = path.resolve(options.outputDir);
  await abortable(() => fs.mkdir(path.join(outputDir, 'performance'), { recursive: true }), preflightSignal);

  const runs: PerformanceRunEvidence[] = [];
  for (let run = 1; run <= COLD_RUNS; run += 1) {
    options.signal?.throwIfAborted();
    const runEvidence = await runOneColdLighthouse({ ...options, url: requested.toString(), outputDir }, run);
    runs.push(runEvidence);
    const callbackSignal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
    await abortable(async () => { await options.onRunComplete?.(run, COLD_RUNS); }, callbackSignal);
    // A timed-out run already makes the required 3/3 cold-run verdict impossible.
    // Do not make the user wait for two more identical hard timeouts.
    if (runEvidence.status === 'FAILED' && /timed out after/i.test(runEvidence.error ?? '')) break;
  }

  const completedRuns = runs.filter((run) => run.status !== 'FAILED').length;
  const validRuns = runs.filter((run) => run.status === 'PASS').length;
  const suspectRuns = runs.filter((run) => run.sanity.status === 'SUSPECT').map((run) => run.run);
  const sanityReasons = [...new Set(runs.flatMap((run) => run.sanity.reasons))];
  const safetyInterference = runs.some((run) => run.safety.safetyInterference);
  const allGuardsVerified = runs.every((run) => run.status === 'PASS' && run.safety.guardVerified);
  const validForVerdict = validRuns === COLD_RUNS && allGuardsVerified && !safetyInterference && suspectRuns.length === 0;
  const auditStatus: PerformanceEvidence['auditStatus'] = validForVerdict
    ? 'PASS'
    : completedRuns === 0
      ? 'FAILED'
      : 'PARTIAL';

  const evidence: PerformanceEvidence = {
    auditStatus,
    labMeasurement: true,
    methodology: 'LIGHTHOUSE_DESKTOP_COLD_3_MEDIAN',
    profile: lighthouseDesktopProfile(),
    requestedRuns: COLD_RUNS,
    completedRuns,
    validRuns,
    validForVerdict,
    measurementSanity: {
      status: suspectRuns.length === 0 ? 'PASS' : 'SUSPECT',
      suspectRuns,
      reasons: sanityReasons,
    },
    nodeVersion: process.versions.node,
    targetUrl: redactUrl(requested.toString()),
    median: medianMetrics(runs),
    medianResources: {
      requestCount: medianNullable(runs.filter((run) => run.status === 'PASS').map((run) => run.resources.requestCount)),
      transferBytes: medianNullable(runs.filter((run) => run.status === 'PASS').map((run) => run.resources.transferBytes)),
    },
    runs,
    limitations: [
      'LAB measurement: not field/RUM data.',
      'A performance verdict requires three completed guarded cold runs.',
      'A hard per-run timeout fails fast because 3/3 trustworthy cold runs are no longer achievable after that timeout.',
      'Any Safe Mode intervention marks the measurement as policy-interfered and invalid for release verdicts.',
      'Safe Mode request routing adds instrumentation overhead; compare guarded results only with baselines produced by the same pinned methodology.',
      'Implausible timing relationships are marked SUSPECT and excluded from performance verdicts instead of being reported as site regressions.',
      'Windows performance remains NOT VERIFIED until executed on Windows or Windows CI/VM.',
    ],
  };

  const saveSignal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  await abortable(() => fs.writeFile(path.join(outputDir, 'performance', 'lighthouse-summary.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'), saveSignal);
  return evidence;
}
