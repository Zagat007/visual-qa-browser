import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import lighthouse from 'lighthouse';
import puppeteer from 'puppeteer-core';
import { chromium, type Route } from 'playwright';
import * as policy from '../audit-engine/security/url-policy';
import { runPerformanceAuditInProcess as runPerformanceAudit } from '../audit-engine/performance/lighthouse-core';

const launcher = vi.hoisted(() => ({ launch: vi.fn(), destroyTmp: vi.fn(), profiles: [] as string[] }));
vi.mock('lighthouse', () => ({ default: vi.fn(), desktopConfig: { settings: {} } }));
vi.mock('puppeteer-core', () => ({ default: { connect: vi.fn() } }));
vi.mock('chrome-launcher', () => ({ Launcher: class {
  port = 9222;
  constructor(options: { userDataDir: string }) { launcher.profiles.push(options.userDataDir); }
  launch() { return launcher.launch(); }
  destroyTmp() { launcher.destroyTmp(); }
} }));
vi.mock('playwright', () => ({ chromium: { executablePath: () => 'fixture-chrome', connectOverCDP: vi.fn() } }));

const roots: string[] = [];
const close = vi.fn(async () => undefined);
const disconnect = vi.fn(async () => undefined);
const send = vi.fn(async () => undefined);
let routeHandler: (route: Route) => Promise<void>;
let pageMarker = '';
const page = { context: () => context, goto: vi.fn(async (url: string) => { pageMarker = url; }) };
const context = {
  route: vi.fn(async (_pattern: string, handler: typeof routeHandler) => { routeHandler = handler; }),
  routeWebSocket: vi.fn(async () => undefined), pages: () => [],
  newPage: vi.fn(async () => page), newCDPSession: vi.fn(async () => ({ send })),
};
const browser = { version: () => 'fixture', close, contexts: () => [context] };
const lighthousePage = { url: () => pageMarker };
const root = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-performance-'));
  roots.push(directory);
  return directory;
};
const success = (score = 0.9) => ({ report: '<html>Lighthouse fixture</html>', lhr: {
  finalDisplayedUrl: 'https://example.com/', lighthouseVersion: 'fixture',
  categories: { performance: { score } }, audits: {
    'first-contentful-paint': { numericValue: 800 },
    'largest-contentful-paint': { numericValue: 1200 },
    'cumulative-layout-shift': { numericValue: 0.02 },
    'server-response-time': { numericValue: 120 },
    'speed-index': { numericValue: 950 },
    'total-blocking-time': { numericValue: 40 },
    'resource-summary': { details: { items: [{ resourceType: 'total', requestCount: 24, transferSize: 320_000 }] } },
  },
} }) as unknown as NonNullable<Awaited<ReturnType<typeof lighthouse>>>;
const never = () => new Promise<never>(() => {});
async function profilesRemoved() {
  for (const profile of launcher.profiles) await expect(fs.stat(profile)).rejects.toMatchObject({ code: 'ENOENT' });
}
beforeEach(() => {
  vi.resetAllMocks();
  launcher.profiles.length = 0;
  launcher.launch.mockResolvedValue(undefined);
  close.mockResolvedValue(undefined);
  disconnect.mockResolvedValue(undefined);
  send.mockResolvedValue(undefined);
  context.route.mockImplementation(async (_pattern, handler) => { routeHandler = handler; });
  context.newPage.mockResolvedValue(page);
  context.newCDPSession.mockResolvedValue({ send });
  page.goto.mockImplementation(async (url) => { pageMarker = url; });
  vi.spyOn(policy, 'assertPublicHttpUrl').mockResolvedValue(new URL('https://example.com/'));
  vi.spyOn(policy, 'evaluateBrowserRequest').mockResolvedValue({ allowed: true });
  vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser as unknown as Awaited<ReturnType<typeof chromium.connectOverCDP>>);
  vi.mocked(puppeteer.connect).mockResolvedValue({ disconnect, pages: async () => [lighthousePage] } as unknown as Awaited<ReturnType<typeof puppeteer.connect>>);
  vi.mocked(lighthouse).mockResolvedValue(success());
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of roots.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});

describe('Lighthouse lifecycle', () => {
  it('returns promptly on user cancellation even if Lighthouse never resolves', async () => {
    let entered!: () => void;
    const measuring = new Promise<void>((resolve) => { entered = resolve; });
    vi.mocked(lighthouse).mockImplementation(async () => { entered(); return never(); });
    const controller = new AbortController();
    const result = runPerformanceAudit({ url: 'https://example.com/', outputDir: await root(), signal: controller.signal });
    const settled = result.then(() => 'resolved', (error: Error) => error.message);
    await measuring;
    controller.abort(new Error('user-cancel'));
    expect(await Promise.race([settled, new Promise((resolve) => setTimeout(() => resolve('still-hung'), 150))])).toBe('user-cancel');
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    await profilesRemoved();
  });

  it('bounds all three stalled measurements and never grants a performance verdict', async () => {
    vi.mocked(lighthouse).mockImplementation(never);
    const completed: number[] = [];
    const result = await runPerformanceAudit({ url: 'https://example.com/', outputDir: await root(), runTimeoutMs: 40,
      onRunComplete: (run) => { completed.push(run); },
    });
    expect(completed).toEqual([1]);
    expect(result.auditStatus).toBe('FAILED');
    expect(result.validForVerdict).toBe(false);
    expect(result.median.performanceScore).toBeNull();
    expect(result.runs).toHaveLength(1);
    expect(result.runs.every((run) => run.status === 'FAILED' && run.error?.includes('timed out'))).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    await profilesRemoved();
  });

  it('cancels DNS preflight without launching Chrome', async () => {
    const controller = new AbortController();
    vi.mocked(policy.assertPublicHttpUrl).mockImplementation(async () => { controller.abort(new Error('cancel-dns')); return never(); });
    await expect(runPerformanceAudit({ url: 'https://example.com/', outputDir: await root(), signal: controller.signal })).rejects.toThrow('cancel-dns');
    expect(launcher.launch).not.toHaveBeenCalled();
  });

  it('cleans an owned profile when cancellation interrupts Chrome readiness', async () => {
    const controller = new AbortController();
    launcher.launch.mockImplementation(async () => { controller.abort(new Error('cancel-launch')); return never(); });
    await expect(runPerformanceAudit({ url: 'https://example.com/', outputDir: await root(), signal: controller.signal })).rejects.toThrow('cancel-launch');
    expect(chromium.connectOverCDP).not.toHaveBeenCalled();
    await profilesRemoved();
  });

  it('runs owned Chrome cleanup only once when launch settles after cancellation', async () => {
    const controller = new AbortController();
    let releaseLaunch!: () => void;
    let entered!: () => void;
    const launching = new Promise<void>((resolve) => { entered = resolve; });
    launcher.launch.mockImplementation(async () => {
      entered();
      await new Promise<void>((resolve) => { releaseLaunch = resolve; });
    });
    const result = runPerformanceAudit({ url: 'https://example.com/', outputDir: await root(), signal: controller.signal });
    const settled = result.catch((error: Error) => error.message);
    await launching;
    controller.abort(new Error('cancel-late-launch'));
    expect(await settled).toBe('cancel-late-launch');
    releaseLaunch();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(launcher.destroyTmp).toHaveBeenCalledTimes(1);
    await profilesRemoved();
  });

  it('closes a CDP connection which arrives after cancellation', async () => {
    const controller = new AbortController();
    let connect!: () => void;
    let entered!: () => void;
    const connecting = new Promise<void>((resolve) => { entered = resolve; });
    vi.mocked(chromium.connectOverCDP).mockImplementation(async () => {
      entered();
      await new Promise<void>((resolve) => { connect = resolve; });
      return browser as unknown as Awaited<ReturnType<typeof chromium.connectOverCDP>>;
    });
    const result = runPerformanceAudit({ url: 'https://example.com/', outputDir: await root(), signal: controller.signal });
    const settled = result.catch((error: Error) => error.message);
    await connecting;
    controller.abort(new Error('cancel-cdp'));
    expect(await settled).toBe('cancel-cdp');
    connect();
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    await profilesRemoved();
  });

  it('cancels a stalled network guard before entering Lighthouse', async () => {
    const controller = new AbortController();
    send.mockImplementation(async () => { controller.abort(new Error('cancel-guard')); return never(); });
    await expect(runPerformanceAudit({ url: 'https://example.com/', outputDir: await root(), signal: controller.signal })).rejects.toThrow('cancel-guard');
    expect(lighthouse).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    await profilesRemoved();
  });

  it('fails closed on a network guard error and preserves its cause', async () => {
    send.mockRejectedValue(new Error('guard-denied'));
    const result = await runPerformanceAudit({ url: 'https://example.com/', outputDir: await root() });
    expect(lighthouse).not.toHaveBeenCalled();
    expect(result.auditStatus).toBe('FAILED');
    expect(result.runs.every((run) => run.error?.includes('guard-denied') && !run.safety.guardVerified)).toBe(true);
    await profilesRemoved();
  });

  it('prepares the same guarded page before measurement and computes a three-run median', async () => {
    vi.mocked(lighthouse).mockImplementation(async (...args) => {
      expect(send).toHaveBeenCalledWith('Network.setBypassServiceWorker', { bypass: true });
      expect(send).toHaveBeenCalledWith('Network.setCacheDisabled', { cacheDisabled: true });
      expect(args[3]).toBe(lighthousePage);
      return success([0.8, 1, 0.9][vi.mocked(lighthouse).mock.calls.length - 1]);
    });
    const result = await runPerformanceAudit({ url: 'https://example.com/', outputDir: await root() });
    expect(new Set(launcher.profiles).size).toBe(3);
    expect(result.auditStatus).toBe('PASS');
    expect(result.validForVerdict).toBe(true);
    expect(result.median.performanceScore).toBe(90);
    await profilesRemoved();
  });

  it('does not grant a verdict when Lighthouse omits a core metric', async () => {
    vi.mocked(lighthouse).mockResolvedValue({ report: '<html>Lighthouse fixture</html>', lhr: {
      finalDisplayedUrl: 'https://example.com/', lighthouseVersion: 'fixture',
      categories: { performance: { score: 0.95 } },
      audits: {
        'first-contentful-paint': { numericValue: 800 },
        'largest-contentful-paint': { numericValue: 1200 },
        'cumulative-layout-shift': { numericValue: 0.02 },
        'server-response-time': { numericValue: 120 },
        'speed-index': { numericValue: 950 },
        'resource-summary': { details: { items: [{ resourceType: 'total', requestCount: 24, transferSize: 320_000 }] } },
      },
    } } as unknown as NonNullable<Awaited<ReturnType<typeof lighthouse>>>);
    const result = await runPerformanceAudit({ url: 'https://example.com/', outputDir: await root() });
    expect(result.auditStatus).toBe('PARTIAL');
    expect(result.validForVerdict).toBe(false);
    expect(result.measurementSanity.status).toBe('SUSPECT');
    expect(result.measurementSanity.reasons.join(' ')).toContain('Total Blocking Time is missing or non-finite');
    expect(result.validRuns).toBe(0);
    await profilesRemoved();
  });

  it('downgrades impossible paint timings to SUSPECT instead of reporting a site performance defect', async () => {
    vi.mocked(lighthouse).mockResolvedValue({ report: '<html>Lighthouse fixture</html>', lhr: {
      finalDisplayedUrl: 'https://example.com/', lighthouseVersion: 'fixture',
      categories: { performance: { score: 0.1 } },
      audits: {
        'first-contentful-paint': { numericValue: 96_801 },
        'largest-contentful-paint': { numericValue: 137_089 },
        'speed-index': { numericValue: 98_000 },
      },
    } } as unknown as NonNullable<Awaited<ReturnType<typeof lighthouse>>>);
    const result = await runPerformanceAudit({ url: 'https://example.com/', outputDir: await root(), runTimeoutMs: 120_000 });
    expect(result.auditStatus).toBe('PARTIAL');
    expect(result.validForVerdict).toBe(false);
    expect(result.measurementSanity.status).toBe('SUSPECT');
    expect(result.validRuns).toBe(0);
    expect(result.median.performanceScore).toBeNull();
    expect(result.runs.every((run) => run.status === 'NOT_VERIFIED' && run.sanity.status === 'SUSPECT')).toBe(true);
    expect(result.measurementSanity.reasons.join(' ')).toContain('configured run timeout');
    await profilesRemoved();
  });

  it('downgrades physically impossible non-paint metrics and resource counters to SUSPECT', async () => {
    vi.mocked(lighthouse).mockResolvedValue({ report: '<html>Lighthouse fixture</html>', lhr: {
      finalDisplayedUrl: 'https://example.com/', lighthouseVersion: 'fixture',
      categories: { performance: { score: 0.95 } },
      audits: {
        'first-contentful-paint': { numericValue: 800 },
        'largest-contentful-paint': { numericValue: 1200 },
        'cumulative-layout-shift': { numericValue: -0.1 },
        'server-response-time': { numericValue: -2 },
        'total-blocking-time': { numericValue: -1 },
        'resource-summary': { details: { items: [{ resourceType: 'total', requestCount: -1, transferSize: -10 }] } },
      },
    } } as unknown as NonNullable<Awaited<ReturnType<typeof lighthouse>>>);
    const result = await runPerformanceAudit({ url: 'https://example.com/', outputDir: await root() });
    expect(result.auditStatus).toBe('PARTIAL');
    expect(result.validForVerdict).toBe(false);
    expect(result.measurementSanity.status).toBe('SUSPECT');
    expect(result.measurementSanity.reasons.join(' ')).toContain('TTFB is negative');
    expect(result.measurementSanity.reasons.join(' ')).toContain('Resource request count is invalid');
    await profilesRemoved();
  });

  it('retains request policy enforcement and excludes interfered results from verdicts', async () => {
    vi.mocked(lighthouse).mockImplementation(async () => {
      for (const [url, method] of [['https://example.com/post', 'POST'], ['http://127.0.0.1/', 'GET'], ['https://example.com/logout', 'GET']]) {
        vi.mocked(policy.evaluateBrowserRequest).mockResolvedValueOnce(url!.includes('127.0.0.1') ? { allowed: false, category: 'private-network', reason: 'private-network' } : { allowed: true });
        const abort = vi.fn();
        const proceed = vi.fn();
        await routeHandler({ request: () => ({ url: () => url, method: () => method, frame: () => ({ page: () => page }) }), abort, continue: proceed } as unknown as Route);
        expect(abort).toHaveBeenCalledWith('blockedbyclient');
        expect(proceed).not.toHaveBeenCalled();
      }
      return success();
    });
    const result = await runPerformanceAudit({ url: 'https://example.com/', outputDir: await root() });
    expect(result.auditStatus).toBe('PARTIAL');
    expect(result.validForVerdict).toBe(false);
    expect(result.runs[0]?.safety).toMatchObject({ blockedMutationRequests: 1, blockedPolicyRequests: 2, safetyInterference: true });
    await profilesRemoved();
  });

  it('blocks an unprepared foreign page without waiting inside its intercepted navigation', async () => {
    vi.mocked(lighthouse).mockImplementation(async () => {
      const abort = vi.fn();
      await routeHandler({ request: () => ({ frame: () => ({ page: () => ({}) }) }), abort } as unknown as Route);
      expect(abort).toHaveBeenCalledWith('blockedbyclient');
      return success();
    });
    const result = await runPerformanceAudit({ url: 'https://example.com/', outputDir: await root() });
    expect(result.validForVerdict).toBe(false);
    expect(result.runs.every((run) => !run.safety.guardVerified && run.status === 'NOT_VERIFIED')).toBe(true);
    expect(context.newCDPSession).toHaveBeenCalledTimes(3);
    await profilesRemoved();
  });
});
