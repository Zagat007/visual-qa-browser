import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as chromeLauncher from 'chrome-launcher';
import { chromium, type Route } from 'playwright';
import { runPerformanceAuditInProcess as runPerformanceAudit } from '../audit-engine/performance/lighthouse-core';
import { runAudit, type AuditProgress } from '../audit-engine/orchestrator/run-audit';
import { cleanupOwnedChrome } from '../audit-engine/performance/lifecycle';
import * as safety from '../audit-engine/security/safe-mode';
import * as policy from '../audit-engine/security/url-policy';

vi.mock('chrome-launcher', { spy: true });

describe('real guarded Lighthouse', () => {
  it('finishes FULL STANDARD with nine modules, Manual Art Director and three real cold runs', async () => {
    const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-real-lighthouse-'));
    const owned: chromeLauncher.Launcher[] = [];
    const { Launcher } = await vi.importActual<typeof chromeLauncher>('chrome-launcher');
    const connect = chromium.connectOverCDP.bind(chromium);
    let fixtureRequests = 0;
    vi.spyOn(policy, 'assertPublicHttpUrl').mockResolvedValue(new URL('https://example.com/'));
    const decide = policy.evaluateBrowserRequest;
    vi.spyOn(policy, 'evaluateBrowserRequest').mockImplementation(async (url) => {
      if (url.startsWith('https://example.com/')) return { allowed: true };
      return decide(url);
    });
    vi.mocked(chromeLauncher.Launcher).mockImplementation(function (options: chromeLauncher.Options, overrides: chromeLauncher.ModuleOverrides) {
      const browser = new Launcher({ ...options,
        ...(process.platform === 'linux' ? { chromePath: chromium.executablePath().replace(/chromium-(\d+)\/chrome-linux\/chrome$/, 'chromium_headless_shell-$1/chrome-linux/headless_shell') } : {}),
        chromeFlags: [...(options?.chromeFlags ?? []), ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
      }, overrides);
      owned.push(browser);
      return browser;
    } as unknown as typeof chromeLauncher.Launcher);
    vi.spyOn(chromium, 'connectOverCDP').mockImplementation(async (...args) => {
      const browser = await connect(...args);
      const context = browser.contexts()[0]!;
      const route = context.route.bind(context);
      vi.spyOn(context, 'route').mockImplementation(async (pattern, handler, options) => {
        await route(pattern, async (requestRoute) => {
          // Only replace the transport after production policy/guard checks.
          const wrapped = new Proxy(requestRoute, {
            get(target, property) {
              if (property === 'continue') return async () => {
                if (target.request().url().startsWith('https://example.com/')) {
                  fixtureRequests += 1;
                  await target.fulfill({ status: 200, contentType: 'text/html', body:
                    '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lighthouse Fixture</title><style>body{font:24px Arial;margin:0;padding:40px;background:#fff;color:#111}h1{font-size:48px}main{min-height:500px}</style></head><body><main><h1>Rendered performance fixture</h1><p>A deterministic page measured by real Lighthouse.</p></main></body></html>' });
                } else await target.abort('blockedbyclient');
              };
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          await handler(wrapped as Route, wrapped.request());
        }, options);
      });
      return browser;
    });
    await fs.cp('configs', path.join(outputDir, 'configs'), { recursive: true });
    // Production uses the isolated Lighthouse worker. This integration test
    // injects the same real Lighthouse core in-process so Vitest browser/network
    // spies remain observable. Separate isolation tests cover IPC and hard-kill.
    const install = safety.installSafeMode;
    vi.spyOn(safety, 'installSafeMode').mockImplementation(async (context, runtime, options) => {
      await install(context, runtime, options);
      await context.route('https://example.com/**', async (route) => route.fulfill({
        status: 200, contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Full QA Fixture</title></head><body><main><h1>Full QA Fixture</h1><p>A deterministic rendered audit page.</p></main></body></html>',
      }));
    });
    const controller = new AbortController();
    const progress: AuditProgress[] = [];
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const audit = runAudit({ rootDir: outputDir, jobId: 'full-standard-fixture', url: 'https://example.com/', signal: controller.signal,
        configuration: {
          mode: 'FULL', viewportPreset: 'STANDARD', powerMode: 'FAST',
          modules: ['VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'RUNTIME', 'ACCESSIBILITY', 'SEO', 'SECURITY', 'PERFORMANCE'],
          artDirection: { enabled: true, provider: 'MANUAL', mode: 'STANDARD', layers: ['PREMIUM_QUALITY', 'VISUAL_HIERARCHY', 'TYPOGRAPHY_SPACING', 'MOBILE', 'DESKTOP'], privateEvidenceAllowed: false, siteProfile: 'GENERIC' },
        }, onProgress: (snapshot) => { progress.push(snapshot); },
      }, { performanceRunner: runPerformanceAudit });
      const timedOut = new Promise<never>((_, reject) => { deadline = setTimeout(() => {
        controller.abort(new Error('fixture deadline'));
        reject(new Error('real Lighthouse fixture did not complete within 90 seconds'));
      }, 90000); });
      const result = await Promise.race([audit, timedOut]);
      const performance = result.performance!;
      expect(result.captureFailures).toEqual([]);
      expect(result.captures).toHaveLength(6);
      expect(result.artDirection?.provider).toBe('MANUAL');
      expect(result.artDirection?.overallScore).toBeNull();
      expect(result.status).not.toBe('FAILED');
      expect(performance.runs).toHaveLength(3);
      expect(progress.filter((item) => /^performance:run-\d$/.test(item.stage)).map((item) => item.stage)).toEqual(['performance:run-1', 'performance:run-2', 'performance:run-3']);
      const measuring = progress.filter((item) => /:measure:/.test(item.stage));
      expect(measuring.length).toBeGreaterThanOrEqual(3);
      // Elapsed heartbeats describe work without incrementing completed steps.
      for (const run of [1, 2, 3]) {
        const steps = measuring.filter((item) => item.stage.startsWith(`performance:run-${run}:`)).map((item) => item.completedSteps);
        expect(new Set(steps).size).toBe(1);
      }
      // JobManager publishes 100% only after this report-producing call returns.
      expect(progress.at(-1)).toMatchObject({ stage: 'report', completedSteps: 33, totalSteps: 34 });
      expect(fixtureRequests).toBeGreaterThanOrEqual(3);
      expect(performance.auditStatus, `Performance evidence was not valid for a verdict: ${JSON.stringify({
        auditStatus: performance.auditStatus,
        validRuns: performance.validRuns,
        validForVerdict: performance.validForVerdict,
        measurementSanity: performance.measurementSanity,
        runs: performance.runs.map((run) => ({
          run: run.run,
          status: run.status,
          error: run.error ?? null,
          sanity: run.sanity,
          safety: run.safety,
          metrics: run.metrics,
        })),
      }, null, 2)}`).toBe('PASS');
      expect(performance.validRuns).toBe(3);
      expect(performance.validForVerdict).toBe(true);
      expect(performance.median.performanceScore).not.toBeNull();
      for (const run of performance.runs) expect((await fs.stat(run.reportPath!)).isFile()).toBe(true);
      expect((await fs.stat(result.reportAbsolutePath)).isFile()).toBe(true);
      expect((await fs.stat(path.join(path.dirname(result.reportAbsolutePath), 'performance/lighthouse-summary.json'))).isFile()).toBe(true);
      const cancelling = new AbortController();
      const cancelStarted = Date.now();
      await expect(runPerformanceAudit({ url: 'https://example.com/', outputDir, signal: cancelling.signal,
        onRunProgress: (snapshot) => {
          if (snapshot.phase === 'measure' && snapshot.elapsedMs >= 1500) cancelling.abort(new Error('real-fixture-cancel'));
        },
      })).rejects.toThrow('real-fixture-cancel');
      expect(Date.now() - cancelStarted).toBeLessThan(8000);
      for (const browser of owned) await expect(fs.stat(browser.userDataDir!)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      if (deadline) clearTimeout(deadline);
      controller.abort(new Error('fixture cleanup'));
      for (const browser of owned) await cleanupOwnedChrome(browser, null, browser.userDataDir!);
      vi.restoreAllMocks();
      await fs.rm(outputDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }, 100000);
});
