import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContextOptions } from 'playwright';
import { loadViewportPlan } from '../browser/viewport-config.js';
import { assertPublicHttpUrl } from '../security/url-policy.js';
import { installSafeMode } from '../security/safe-mode.js';
import { runResponsiveSweep } from '../responsive/sweep.js';
import { runInteractionAudit } from '../interactions/interaction.js';
import { stabilizePage } from '../deterministic-capture/stabilize.js';
import { captureScreenshotWithRetry } from '../deterministic-capture/capture.js';
import { captureMajorSections } from '../deterministic-capture/sections.js';
import { attachRuntimeCollector } from '../runtime/collector.js';
import { collectGeometryEvidence } from '../geometry/geometry.js';
import { collectTypographyEvidence } from '../visual/typography.js';
import { collectImageEvidence } from '../visual/images.js';
import { collectAccessibilityEvidence } from '../accessibility/accessibility.js';
import { collectSeoEvidence } from '../seo/seo.js';
import { runSiteTechnicalChecks } from '../seo/site-checks.js';
import { collectDeliveryEvidence } from '../security/delivery.js';
import { redactText, redactUrl } from '../privacy/redaction.js';
import { writeReport } from '../reporting/report.js';
import { collectAuditMetadata } from '../evidence/provenance.js';
import { determineAuditStatus } from './verdict.js';
import { confirmedGeometryIssueCount, confirmedInteractionIssueCount, confirmedSiteTechnicalIssueCount, interactionIncompleteReasons, siteTechnicalIncompleteReasons, truncationIncompleteReasons } from './classification.js';
import { runPerformanceAudit } from '../performance/lighthouse.js';
import { collectArtContext } from '../art-direction/context.js';
import { runArtDirectionReview } from '../art-direction/run.js';
import { resolveWorkerPlan } from './execution-settings.js';
import type { AuditConfiguration, AuditModule, AuditResult, CaptureEvidence, CaptureFailure, ViewportSpec } from '../shared/types.js';


function safeDomain(hostname: string): string {
  return hostname.toLowerCase().replace(/[^a-z0-9.-]/g, '_').slice(0, 120) || 'unknown';
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function contextOptions(viewport: ViewportSpec): BrowserContextOptions {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    reducedMotion: 'no-preference',
    serviceWorkers: 'block',
  };
}

function subsystemError(error: unknown): string {
  return redactText(error instanceof Error ? error.message : 'Unknown subsystem failure').slice(0, 2_000);
}

function failedAccessibility(error: unknown): CaptureEvidence['accessibility'] {
  return {
    auditStatus: 'FAILED',
    error: subsystemError(error),
    engine: 'axe-core',
    version: 'NOT_VERIFIED',
    automatedOnly: true,
    violationCount: 0,
    incompleteCount: 0,
    passCount: 0,
    inapplicableCount: 0,
    violations: [],
    incomplete: [],
  };
}

function skippedAccessibility(): CaptureEvidence['accessibility'] {
  return {
    auditStatus: 'SKIPPED_SAFELY',
    engine: 'axe-core',
    version: 'NOT_REQUESTED',
    automatedOnly: true,
    violationCount: 0,
    incompleteCount: 0,
    passCount: 0,
    inapplicableCount: 0,
    violations: [],
    incomplete: [],
  };
}

function failedSeo(error: unknown): CaptureEvidence['seo'] {
  return {
    auditStatus: 'FAILED',
    error: subsystemError(error),
    title: '',
    description: '',
    canonical: '',
    robots: '',
    viewport: '',
    lang: '',
    openGraph: { title: '', description: '', image: '', url: '', type: '' },
    twitter: { card: '', title: '', description: '', image: '' },
    h1Count: 0,
    headings: [],
    headingJumps: [],
    noindex: false,
    findings: [],
  };
}

function skippedSeo(): CaptureEvidence['seo'] {
  return {
    auditStatus: 'SKIPPED_SAFELY',
    title: '',
    description: '',
    canonical: '',
    robots: '',
    viewport: '',
    lang: '',
    openGraph: { title: '', description: '', image: '', url: '', type: '' },
    twitter: { card: '', title: '', description: '', image: '' },
    h1Count: 0,
    headings: [],
    headingJumps: [],
    noindex: false,
    findings: [],
  };
}

function failedDelivery(error: unknown, finalUrl: string): CaptureEvidence['delivery'] {
  return {
    auditStatus: 'FAILED',
    error: subsystemError(error),
    finalUrl: redactUrl(finalUrl),
    status: null,
    headers: {},
    setCookieCount: 0,
    cookieFlagSummary: { missingSecure: 0, missingHttpOnly: 0, missingSameSite: 0 },
    findings: [],
  };
}

function skippedDelivery(finalUrl: string): CaptureEvidence['delivery'] {
  return {
    auditStatus: 'SKIPPED_SAFELY',
    finalUrl: redactUrl(finalUrl),
    status: null,
    headers: {},
    setCookieCount: 0,
    cookieFlagSummary: { missingSecure: 0, missingHttpOnly: 0, missingSameSite: 0 },
    findings: [],
  };
}

function emptyGeometry(viewport: ViewportSpec): CaptureEvidence['geometry'] {
  return {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    documentScrollWidth: 0,
    documentScrollHeight: 0,
    horizontalOverflowPx: 0,
    elementsScanned: 0,
    elementsTruncated: false,
    overlapPairsScanned: 0,
    findings: [],
    stickyFixed: [],
    stackingContexts: [],
    sectionGaps: [],
  };
}

function emptyTypography(): CaptureEvidence['typography'] {
  return { groups: [] };
}

function emptyImages(): CaptureEvidence['images'] {
  return {
    totalImages: 0,
    sampledImages: 0,
    truncated: false,
    brokenImages: 0,
    cropCandidates: 0,
    duplicateUrlGroups: [],
    metrics: [],
  };
}

function hasModule(modules: ReadonlySet<AuditModule>, module: AuditModule): boolean {
  return modules.has(module);
}


async function collectDeviceContext(page: import('playwright').Page): Promise<CaptureEvidence['deviceContext']> {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    orientationType: screen.orientation?.type ?? '',
    orientationAngle: screen.orientation?.angle ?? 0,
    pointerFine: matchMedia('(pointer: fine)').matches,
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    hoverCapable: matchMedia('(hover: hover)').matches,
    anyHoverCapable: matchMedia('(any-hover: hover)').matches,
  }));
}

function runtimeEvidenceDropped(runtime: CaptureEvidence['runtime']): boolean {
  return runtime.limits.consoleDropped > 0 || runtime.limits.pageErrorsDropped > 0 || runtime.limits.networkDropped > 0 || (runtime.limits.textTruncated ?? 0) > 0;
}

function captureIncompleteReasons(capture: CaptureEvidence, modules: ReadonlySet<AuditModule>): string[] {
  const reasons: string[] = [];
  const stabilization = capture.stabilization;
  const needsStableRender = ['VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'ACCESSIBILITY'].some((module) => modules.has(module as AuditModule));
  if (needsStableRender) {
    if (!stabilization.fontsReady) reasons.push(`${capture.viewport.name}: fonts did not reach ready state`);
    if (!stabilization.imagesReady) reasons.push(`${capture.viewport.name}: images did not reach ready state`);
    if (!stabilization.lazyLoadWarmup) reasons.push(`${capture.viewport.name}: lazy-load warmup failed`);
    if (!stabilization.layoutStable) reasons.push(`${capture.viewport.name}: layout stability gate failed`);
    if (!stabilization.animationsControlled) reasons.push(`${capture.viewport.name}: animation control failed`);
  }
  if ((needsStableRender || modules.has('RUNTIME')) && !stabilization.networkIdleObserved) reasons.push(`${capture.viewport.name}: network idle was not observed`);
  if (modules.has('VISUAL') && capture.geometry.elementsTruncated) reasons.push(`${capture.viewport.name}: geometry scan truncated`);
  if (modules.has('VISUAL') && capture.images.truncated) reasons.push(`${capture.viewport.name}: image evidence truncated`);
  if (modules.has('RUNTIME') && runtimeEvidenceDropped(capture.runtime)) reasons.push(`${capture.viewport.name}: runtime evidence dropped by collection limits`);
  if (modules.has('ACCESSIBILITY') && capture.accessibility.incompleteCount > 0) reasons.push(`${capture.viewport.name}: axe-core returned incomplete checks`);
  return reasons;
}


function meaningfulIssueCount(capture: CaptureEvidence, modules: ReadonlySet<AuditModule>): number {
  let count = 0;
  if (modules.has('RUNTIME')) {
    count += capture.runtime.pageErrors.length;
    count += capture.runtime.console.filter((entry) => entry.type === 'error').length;
    count += capture.runtime.network.filter((entry) => entry.kind === 'http-error' || entry.kind === 'asset-error' || entry.kind === 'request-failed' || entry.kind === 'mixed-content').length;
  }
  if (modules.has('VISUAL')) {
    count += capture.stabilization.brokenImageCount;
    count += confirmedGeometryIssueCount(capture.geometry.findings);
  }
  if (modules.has('ACCESSIBILITY')) count += capture.accessibility.violationCount;
  if (modules.has('SEO')) count += capture.seo.findings.filter((finding) => finding.severity === 'P2' || finding.severity === 'P1' || finding.severity === 'P0').length;
  if (modules.has('SECURITY')) count += capture.delivery.findings.filter((finding) => finding.severity === 'P2' || finding.severity === 'P1' || finding.severity === 'P0').length;
  return count;
}

export interface AuditProgress {
  stage: string;
  completedCaptures: number;
  totalCaptures: number;
  progressPercent: number;
  completedSteps: number;
  totalSteps: number;
  remainingSteps: number;
  currentViewport?: string;
  currentSubsystem?: string;
}

export interface RunAuditOptions {
  rootDir: string;
  jobId: string;
  url: string;
  configuration: AuditConfiguration;
  signal?: AbortSignal;
  onProgress?: (progress: AuditProgress) => void | Promise<void>;
}

interface RunAuditDependencies {
  performanceRunner: typeof runPerformanceAudit;
}

async function runPool<T>(items: readonly T[], workers: number, task: (item: T, index: number) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let next = 0;
  const count = Math.max(1, Math.min(workers, items.length || 1));
  await Promise.all(Array.from({ length: count }, async () => {
    while (true) {
      signal?.throwIfAborted();
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      await task(item, index);
    }
  }));
}

function performanceIssueCount(performance: AuditResult['performance']): number {
  if (!performance?.validForVerdict) return 0;
  const metric = performance.median;
  let count = 0;
  if (metric.performanceScore !== null && metric.performanceScore < 90) count += 1;
  if (metric.lcpMs !== null && metric.lcpMs > 2500) count += 1;
  if (metric.cls !== null && metric.cls > 0.1) count += 1;
  if (metric.fcpMs !== null && metric.fcpMs > 1800) count += 1;
  if (metric.totalBlockingTimeMs !== null && metric.totalBlockingTimeMs > 200) count += 1;
  return count;
}

export async function runAudit(options: RunAuditOptions, dependencies: Partial<RunAuditDependencies> = {}): Promise<AuditResult> {
  const performanceRunner = dependencies.performanceRunner ?? runPerformanceAudit;
  const startedAt = new Date();
  options.signal?.throwIfAborted();
  const requested = await assertPublicHttpUrl(options.url);
  const modules = new Set<AuditModule>(options.configuration.modules);
  const viewports = await loadViewportPlan(options.rootDir, options.configuration);
  const powerMode = options.configuration.powerMode ?? 'NORMAL';
  const interactionDepth = options.configuration.interactionDepth ?? 'KEY';
  const workerPlan = resolveWorkerPlan(powerMode);
  const plannedInteractionRuns = modules.has('FORMS') || modules.has('INTERACTIONS')
    ? (interactionDepth === 'ALL' ? viewports.length : Math.min(2, viewports.length))
    : 0;
  const plannedPerformanceRuns = modules.has('PERFORMANCE') ? 3 : 0;
  const artDirectionEnabled = options.configuration.artDirection?.enabled === true;
  const totalSteps = 1
    + (viewports.length * 4)
    + (modules.has('RESPONSIVE') ? 1 : 0)
    + (modules.has('SEO') ? 1 : 0)
    + plannedInteractionRuns
    + plannedPerformanceRuns
    + (artDirectionEnabled ? 1 : 0)
    + 1;
  let completedSteps = 0;
  let progressChain = Promise.resolve();
  const emitProgress = async (stage: string, completedCaptures: number, currentViewport?: string, currentSubsystem?: string): Promise<void> => {
    const snapshot: AuditProgress = {
      stage,
      completedCaptures,
      totalCaptures: viewports.length,
      progressPercent: totalSteps > 0 ? Math.min(99, Math.floor((completedSteps / totalSteps) * 100)) : 0,
      completedSteps,
      totalSteps,
      remainingSteps: Math.max(0, totalSteps - completedSteps),
      ...(currentViewport ? { currentViewport } : {}),
      ...(currentSubsystem ? { currentSubsystem } : {}),
    };
    progressChain = progressChain.then(async () => { await options.onProgress?.(snapshot); });
    await progressChain;
  };
  const advance = async (stage: string, completedCaptures: number, currentViewport?: string, currentSubsystem?: string, amount = 1): Promise<void> => {
    completedSteps = Math.min(totalSteps, completedSteps + amount);
    await emitProgress(stage, completedCaptures, currentViewport, currentSubsystem);
  };

  const outputDir = path.join(options.rootDir, 'reports', safeDomain(requested.hostname), `${stamp(startedAt)}_${options.jobId}`);
  const screenshotsDir = path.join(outputDir, 'screenshots');
  await fs.mkdir(screenshotsDir, { recursive: true });
  await emitProgress('launch-browser', 0, undefined, 'BROWSER');
  options.signal?.throwIfAborted();

  const browser = await chromium.launch({ headless: true });
  const abortBrowser = (): void => { void browser.close().catch(() => undefined); };
  options.signal?.addEventListener('abort', abortBrowser, { once: true });
  const captures: CaptureEvidence[] = [];
  const captureFailures: CaptureFailure[] = [];
  const viewportOrder = new Map(viewports.map((viewport, index) => [viewport.name, index]));

  try {
    // Cancellation may arrive while launch is resolving, before the listener exists.
    options.signal?.throwIfAborted();
    await advance('launch-browser', 0, undefined, 'BROWSER');
    const metadata = await collectAuditMetadata(options.rootDir, browser.version());
    await runPool(viewports, workerPlan.viewportWorkers, async (viewport, index) => {
      options.signal?.throwIfAborted();
      const context = await browser.newContext(contextOptions(viewport));
      let runtime: ReturnType<typeof attachRuntimeCollector> | null = null;
      let finishedStages = 0;
      try {
        await installSafeMode(context, () => {
          if (!runtime) throw new Error(`Safe Mode runtime is not bound for ${viewport.name}.`);
          return runtime;
        });
        const page = await context.newPage();
        runtime = attachRuntimeCollector(page);
        await emitProgress(`${viewport.name}:navigate`, captures.length, viewport.name, 'NAVIGATION');
        const response = await page.goto(requested.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
        finishedStages += 1;
        await advance(`${viewport.name}:stabilize`, captures.length, viewport.name, 'STABILIZATION');
        options.signal?.throwIfAborted();
        const stabilization = await stabilizePage(page);
        finishedStages += 1;
        await advance(`${viewport.name}:measure`, captures.length, viewport.name, 'EVIDENCE');
        options.signal?.throwIfAborted();
        const deviceContext = await collectDeviceContext(page);
        const collectVisualEvidence = hasModule(modules, 'VISUAL') || artDirectionEnabled;
        const geometry = collectVisualEvidence ? await collectGeometryEvidence(page) : emptyGeometry(viewport);
        const typography = collectVisualEvidence ? await collectTypographyEvidence(page) : emptyTypography();
        const images = collectVisualEvidence ? await collectImageEvidence(page) : emptyImages();
        const artContext = artDirectionEnabled ? await collectArtContext(page) : { visibleText: '', headings: [], ctas: [], sections: [] };
        const accessibility = hasModule(modules, 'ACCESSIBILITY') ? await collectAccessibilityEvidence(page).catch(failedAccessibility) : skippedAccessibility();
        const seo = hasModule(modules, 'SEO') ? await collectSeoEvidence(page).catch(failedSeo) : skippedSeo();
        const delivery = hasModule(modules, 'SECURITY') ? await collectDeliveryEvidence(response, page.url()).catch((error) => failedDelivery(error, page.url())) : skippedDelivery(page.url());
        finishedStages += 1;
        await advance(`${viewport.name}:capture`, captures.length, viewport.name, 'SCREENSHOT');
        options.signal?.throwIfAborted();
        const screenshotEvidence = await captureScreenshotWithRetry(page, path.join(screenshotsDir, `${viewport.name}.png`));
        const sectionScreenshots = (hasModule(modules, 'VISUAL') || artDirectionEnabled) ? await captureMajorSections(page, outputDir, viewport.name) : [];
        const documentSize = await page.evaluate(() => ({
          width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
          height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        }));
        captures.push({
          viewport, deviceContext, ...screenshotEvidence, sectionScreenshots,
          title: await page.title(), finalUrl: redactUrl(page.url()), httpStatus: response?.status() ?? null,
          documentSize, stabilization, geometry, typography, images, accessibility, seo, delivery, runtime, artContext,
        });
        finishedStages += 1;
        await advance(`${viewport.name}:complete`, captures.length, viewport.name, 'CAPTURE');
      } catch (error) {
        if (options.signal?.aborted) throw error;
        captureFailures.push({ viewport, error: subsystemError(error) });
        const missing = Math.max(0, 4 - finishedStages);
        if (missing > 0) await advance(`${viewport.name}:failed`, captures.length, viewport.name, 'CAPTURE', missing);
      } finally {
        await context.close().catch(() => undefined);
      }
      void index;
    }, options.signal);
    captures.sort((a, b) => (viewportOrder.get(a.viewport.name) ?? 0) - (viewportOrder.get(b.viewport.name) ?? 0));

    let responsiveSweep: AuditResult['responsiveSweep'] = null;
    let responsiveSweepFailure: string | null = null;
    if (modules.has('RESPONSIVE')) {
      options.signal?.throwIfAborted();
      await emitProgress('responsive-sweep', captures.length, undefined, 'RESPONSIVE');
      try { responsiveSweep = await runResponsiveSweep(browser, options.rootDir, requested.toString(), outputDir, options.signal); }
      catch (error) { responsiveSweepFailure = subsystemError(error); }
      finally { await advance('responsive-sweep', captures.length, undefined, 'RESPONSIVE'); }
    }

    let siteTechnical: AuditResult['siteTechnical'] = null;
    let siteTechnicalFailure: string | null = null;
    if (modules.has('SEO')) {
      options.signal?.throwIfAborted();
      await emitProgress('technical-site-checks', captures.length, undefined, 'SEO');
      try { siteTechnical = await runSiteTechnicalChecks(browser, requested.toString(), options.jobId); }
      catch (error) { siteTechnicalFailure = subsystemError(error); }
      finally { await advance('technical-site-checks', captures.length, undefined, 'SEO'); }
    }

    const interactionAudits: AuditResult['interactionAudits'] = [];
    const interactionFailures: AuditResult['interactionFailures'] = [];
    if (modules.has('FORMS') || modules.has('INTERACTIONS')) {
      const keyCandidates = [
        captures.find((capture) => capture.viewport.name === 'desktop-1440')?.viewport,
        captures.find((capture) => capture.viewport.name === 'mobile-390')?.viewport,
        captures[0]?.viewport,
      ].filter((viewport): viewport is ViewportSpec => Boolean(viewport));
      const keyViewports = keyCandidates.filter((viewport, index, list) => list.findIndex((item) => item.name === viewport.name) === index).slice(0, 2);
      const interactionViewports = interactionDepth === 'ALL' ? captures.map((capture) => capture.viewport) : keyViewports;
      await runPool(interactionViewports, workerPlan.interactionWorkers, async (viewport) => {
        options.signal?.throwIfAborted();
        const stage = `${viewport.name}:${modules.has('INTERACTIONS') ? 'interactions' : 'forms'}`;
        await emitProgress(stage, captures.length, viewport.name, modules.has('INTERACTIONS') ? 'INTERACTIONS' : 'FORMS');
        try {
          interactionAudits.push(await runInteractionAudit(browser, requested.toString(), viewport, outputDir, {
            inspectForms: modules.has('FORMS'), testInteractions: modules.has('INTERACTIONS'),
          }));
        } catch (error) {
          if (options.signal?.aborted) throw error;
          interactionFailures.push({ viewport, error: subsystemError(error) });
        } finally {
          await advance(stage, captures.length, viewport.name, modules.has('INTERACTIONS') ? 'INTERACTIONS' : 'FORMS');
        }
      }, options.signal);
      const missing = Math.max(0, plannedInteractionRuns - interactionViewports.length);
      if (missing > 0) completedSteps = Math.min(totalSteps, completedSteps + missing);
    }

    let performance: AuditResult['performance'] = null;
    let performanceFailure: string | null = null;
    if (modules.has('PERFORMANCE')) {
      options.signal?.throwIfAborted();
      await emitProgress('performance', captures.length, undefined, 'PERFORMANCE');
      try {
        performance = await performanceRunner({
          url: requested.toString(), outputDir, ...(options.signal ? { signal: options.signal } : {}),
          onRunProgress: async (progress) => {
            await emitProgress(`performance:run-${progress.run}:${progress.phase}:${Math.floor(progress.elapsedMs / 1000)}:${Math.ceil(progress.timeoutMs / 1000)}`, captures.length, undefined, 'PERFORMANCE');
          },
          onRunComplete: async (run) => { await advance(`performance:run-${run}`, captures.length, undefined, 'PERFORMANCE'); },
        });
        // A timed-out Lighthouse run fails fast because 3/3 valid runs are no
        // longer possible. Account for intentionally skipped runs so weighted
        // progress does not remain stuck near 100% while report generation continues.
        const skippedPerformanceRuns = Math.max(0, plannedPerformanceRuns - performance.runs.length);
        if (skippedPerformanceRuns > 0) {
          completedSteps = Math.min(totalSteps, completedSteps + skippedPerformanceRuns);
          await emitProgress('performance:incomplete-skipped', captures.length, undefined, 'PERFORMANCE');
        }
      } catch (error) {
        if (options.signal?.aborted) throw error;
        performanceFailure = subsystemError(error);
        const consumed = performance?.completedRuns ?? 0;
        const missing = Math.max(0, plannedPerformanceRuns - consumed);
        if (missing > 0) completedSteps = Math.min(totalSteps, completedSteps + missing);
      }
    }

    const responsiveIssueCount = modules.has('RESPONSIVE') ? (responsiveSweep?.findings.filter((finding) => finding.rule === 'responsive-overflow' && finding.verification?.status === 'CONFIRMED').length ?? 0) : 0;
    const interactionIssueCount = confirmedInteractionIssueCount(interactionAudits, modules);
    const siteTechnicalIssueCount = confirmedSiteTechnicalIssueCount(siteTechnical, modules.has('SEO'));
    const perfIssueCount = modules.has('PERFORMANCE') ? performanceIssueCount(performance) : 0;
    const issueCount = captures.reduce((sum, capture) => sum + meaningfulIssueCount(capture, modules), 0) + responsiveIssueCount + interactionIssueCount + siteTechnicalIssueCount + perfIssueCount;

    const policyBlockedCount = captures.reduce((sum, capture) => sum + capture.runtime.network.filter((entry) => ['skipped-safely','blocked-private-network','policy-blocked','request-validation-failed','websocket-blocked'].includes(entry.kind)).length, 0) + (responsiveSweep?.policyBlockedRequests ?? 0);
    const interactionPolicyBlockedCount = interactionAudits.reduce((sum, audit) => sum + audit.runtime.network.filter((entry) => ['skipped-safely','blocked-private-network','policy-blocked','request-validation-failed','websocket-blocked'].includes(entry.kind)).length, 0);
    const interactionSkippedSafely = interactionAudits.reduce((sum, audit) => sum + audit.skippedSafely, 0);
    const sitePolicyBlockedCount = siteTechnical?.runtime.network.filter((entry) => ['skipped-safely','blocked-private-network','policy-blocked','request-validation-failed','websocket-blocked'].includes(entry.kind)).length ?? 0;
    const combinedPolicyBlockedCount = policyBlockedCount + interactionPolicyBlockedCount + sitePolicyBlockedCount;
    const validationFailedCount = captures.reduce((sum, capture) => sum + capture.runtime.network.filter((entry) => entry.kind === 'request-validation-failed').length, 0) + (responsiveSweep?.validationFailedRequests ?? 0) + interactionAudits.reduce((sum, audit) => sum + audit.runtime.network.filter((entry) => entry.kind === 'request-validation-failed').length, 0) + (siteTechnical?.runtime.network.filter((entry) => entry.kind === 'request-validation-failed').length ?? 0);
    const subsystemIncompleteCount = captures.reduce((sum, capture) => {
      const statuses = [modules.has('ACCESSIBILITY') ? capture.accessibility.auditStatus : null, modules.has('SEO') ? capture.seo.auditStatus : null, modules.has('SECURITY') ? capture.delivery.auditStatus : null];
      return sum + statuses.filter((status) => status === 'FAILED' || status === 'PARTIAL' || status === 'NOT_VERIFIED').length;
    }, 0);
    const incompleteReasons = [...captures.flatMap((capture) => captureIncompleteReasons(capture, modules)), ...interactionAudits.flatMap(interactionIncompleteReasons)];
    if (captureFailures.length > 0) incompleteReasons.push(`${captureFailures.length} viewport capture(s) failed`);
    if (responsiveSweepFailure !== null) incompleteReasons.push('responsive sweep failed');
    if ((responsiveSweep?.unstableWidths.length ?? 0) > 0) incompleteReasons.push(`responsive layout did not stabilize at ${responsiveSweep?.unstableWidths.length ?? 0} width(s)`);
    if (responsiveSweep?.findings.some((finding) => finding.rule === 'responsive-overflow' && finding.verification?.status === 'NOT_VERIFIED')) incompleteReasons.push('responsive overflow could not be verified on repeat');
    if (responsiveSweep?.findings.some((finding) => finding.rule === 'responsive-overflow' && finding.verification?.status === 'NOT_REPRODUCED')) incompleteReasons.push('responsive overflow was observed once but did not recur on repeat');
    if (interactionFailures.length > 0) incompleteReasons.push(`${interactionFailures.length} interaction audit(s) failed`);
    if (siteTechnicalFailure !== null) incompleteReasons.push('site technical checks failed');
    incompleteReasons.push(...siteTechnicalIncompleteReasons(siteTechnical, modules.has('SEO')));
    if (subsystemIncompleteCount > 0) incompleteReasons.push(`${subsystemIncompleteCount} capture subsystem result(s) incomplete`);
    if (combinedPolicyBlockedCount > 0) incompleteReasons.push(`${combinedPolicyBlockedCount} request(s) blocked by safety policy`);
    if (interactionSkippedSafely > 0) incompleteReasons.push(`${interactionSkippedSafely} interaction(s) skipped safely`);
    if (modules.has('PERFORMANCE')) {
      if (performanceFailure) incompleteReasons.push('performance audit failed');
      else if (performance?.measurementSanity.status === 'SUSPECT') incompleteReasons.push(`performance measurement sanity is SUSPECT (${performance.measurementSanity.reasons.join(' | ')})`);
      else if (!performance?.validForVerdict) incompleteReasons.push('performance evidence is incomplete or Safe Mode interfered with measurement');
    }
    if (siteTechnical && (siteTechnical.runtime.limits.consoleDropped > 0 || siteTechnical.runtime.limits.pageErrorsDropped > 0 || siteTechnical.runtime.limits.networkDropped > 0 || (siteTechnical.runtime.limits.textTruncated ?? 0) > 0)) incompleteReasons.push('site technical runtime evidence dropped by collection limits');
    const truncatedEvidenceSources = [
      ...(modules.has('VISUAL') ? captures.filter((capture) => capture.geometry.elementsTruncated).map((capture) => `${capture.viewport.name}:geometry`) : []),
      ...(modules.has('VISUAL') ? captures.filter((capture) => capture.images.truncated).map((capture) => `${capture.viewport.name}:images`) : []),
      ...(modules.has('RUNTIME') ? captures.filter((capture) => runtimeEvidenceDropped(capture.runtime)).map((capture) => `${capture.viewport.name}:runtime`) : []),
      ...(modules.has('INTERACTIONS') ? interactionAudits.filter((audit) => audit.discoveryTruncated).map((audit) => `${audit.viewport.name}:interactions`) : []),
      ...(modules.has('FORMS') ? interactionAudits.filter((audit) => audit.forms.formsTruncated || audit.forms.fieldsTruncated).map((audit) => `${audit.viewport.name}:forms`) : []),
    ];
    incompleteReasons.push(...truncationIncompleteReasons(truncatedEvidenceSources));
    const uniqueIncompleteReasons = [...new Set(incompleteReasons)];
    const verdict = determineAuditStatus({ completedCaptures: captures.length, requestedCaptures: viewports.length, incompleteReasons: uniqueIncompleteReasons, issueCount });
    const { status, fullPassEligible } = verdict;
    const reportAbsolutePath = path.join(outputDir, 'report.html');
    const reportRelativePath = path.relative(path.join(options.rootDir, 'reports'), reportAbsolutePath).split(path.sep).join('/');
    const notes = [
      `Выбранный scope: ${options.configuration.mode}; модули: ${options.configuration.modules.join(', ')}.`,
      `Viewport preset ${options.configuration.viewportPreset}: завершено ${captures.length}/${viewports.length} capture-проверок.`,
      `Режим мощности ${powerMode}: viewport workers=${workerPlan.viewportWorkers}; interaction workers=${workerPlan.interactionWorkers}; безопасный предел железа=${workerPlan.hardware.safeWorkerCapacity}.`,
      `Глубина forms/interactions: ${interactionDepth}.`,
      'PASS относится только к выбранному scope и выбранным viewport; непроверенные подсистемы не включаются в verdict.',
      'Автоматические visual candidates не подменяют art-direction verdict.',
      options.configuration.viewportPreset === 'DEEP' ? 'DEEP включает breakpoint triads −1 / 0 / +1.' : 'Breakpoint triads включаются только в viewport preset DEEP.',
      'Source forensics и baseline visual regression требуют отдельного подтверждённого input/baseline и не маскируются под live PASS.',
      'Windows runtime должен подтверждаться отдельным запуском в Windows.',
    ];
    if (modules.has('ACCESSIBILITY')) notes.push('axe-core даёт только автоматизированное accessibility evidence; ручная проверка остаётся NOT VERIFIED.');
    if (modules.has('PERFORMANCE')) notes.push('Lighthouse performance — LAB measurement, не field/RUM data; sanity-anomalies автоматически исключаются из verdict.');
    const result: AuditResult = {
      jobId: options.jobId, requestedUrl: redactUrl(requested.toString()), preset: options.configuration.viewportPreset,
      configuration: { ...options.configuration, powerMode, interactionDepth }, startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
      status, safeMode: true, metadata,
      execution: { requestedPowerMode: powerMode, viewportWorkers: workerPlan.viewportWorkers, interactionWorkers: workerPlan.interactionWorkers, interactionDepth, hardware: workerPlan.hardware },
      coverage: {
        fullPassEligible, incompleteReasons: uniqueIncompleteReasons, truncatedEvidenceSources: [...new Set(truncatedEvidenceSources)],
        requestedViewports: viewports.length, completedViewports: captures.length, failedViewports: captureFailures.length,
        sectionScreenshots: captures.reduce((sum, capture) => sum + capture.sectionScreenshots.length, 0),
        skippedSafelyRequests: captures.reduce((sum, capture) => sum + capture.runtime.network.filter((entry) => entry.kind === 'skipped-safely').length, 0),
        policyBlockedRequests: combinedPolicyBlockedCount, validationFailedRequests: validationFailedCount,
        responsiveSweepSamples: responsiveSweep?.samples.length ?? 0, interactionViewports: interactionAudits.length,
        interactionCandidates: interactionAudits.reduce((sum, audit) => sum + audit.discovered, 0),
        interactionsTested: interactionAudits.reduce((sum, audit) => sum + audit.candidates.filter((candidate) => candidate.hoverTested || candidate.focusTested || candidate.activationTested).length, 0),
        interactionsSkippedSafely: interactionSkippedSafely, formFieldsInspected: interactionAudits.reduce((sum, audit) => sum + audit.forms.fields.length, 0),
      },
      captures, captureFailures, responsiveSweep, responsiveSweepFailure, interactionAudits, interactionFailures,
      siteTechnical, siteTechnicalFailure, performance, performanceFailure, artDirection: null, reportRelativePath, reportAbsolutePath, notes,
    };
    if (artDirectionEnabled && options.configuration.artDirection) {
      options.signal?.throwIfAborted();
      await emitProgress('art-direction', captures.length, undefined, 'ART_DIRECTION');
      result.artDirection = await runArtDirectionReview(options.rootDir, outputDir, result, options.configuration.artDirection, options.signal);
      await advance('art-direction', captures.length, undefined, 'ART_DIRECTION');
      if (result.artDirection.status === 'FAILED' || result.artDirection.status === 'NOT_CONFIGURED' || result.artDirection.status === 'PARTIAL') {
        result.notes.push(`AI Art Director: ${result.artDirection.status}. Technical QA verdict is unchanged.`);
      }
    }
    result.finishedAt = new Date().toISOString();
    options.signal?.throwIfAborted();
    await emitProgress('report', captures.length, undefined, 'REPORT');
    await writeReport(result);
    completedSteps = totalSteps;
    return result;
  } finally {
    options.signal?.removeEventListener('abort', abortBrowser);
    await browser.close().catch(() => undefined);
  }
}
