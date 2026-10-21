import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import * as provenance from '../audit-engine/evidence/provenance';
import * as policy from '../audit-engine/security/url-policy';
import * as safety from '../audit-engine/security/safe-mode';
import * as reporting from '../audit-engine/reporting/report';
import * as responsive from '../audit-engine/responsive/sweep';
import { runAudit } from '../audit-engine/orchestrator/run-audit';
import type { AuditConfiguration } from '../audit-engine/shared/types';

const roots: string[] = [];
const configuration: AuditConfiguration = {
  mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'CUSTOM',
  customViewport: { width: 390, height: 844 }, powerMode: 'ECO',
};
async function root(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-engine-'));
  roots.push(dir);
  await fs.cp('configs', path.join(dir, 'configs'), { recursive: true });
  return dir;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('audit lifecycle and rendered report pipeline', () => {
  it('closes Chromium when metadata collection fails after launch', async () => {
    vi.spyOn(policy, 'assertPublicHttpUrl').mockResolvedValue(new URL('https://example.com/'));
    const close = vi.fn(async () => undefined);
    vi.spyOn(chromium, 'launch').mockResolvedValue({ close, version: () => 'fixture' } as unknown as Browser);
    vi.spyOn(provenance, 'collectAuditMetadata').mockRejectedValue(new Error('metadata-failed'));
    await expect(runAudit({ rootDir: await root(), jobId: 'metadata', url: 'https://example.com/', configuration })).rejects.toThrow('metadata-failed');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes Chromium when cancellation occurs during browser launch', async () => {
    vi.spyOn(policy, 'assertPublicHttpUrl').mockResolvedValue(new URL('https://example.com/'));
    const controller = new AbortController();
    const close = vi.fn(async () => undefined);
    vi.spyOn(chromium, 'launch').mockImplementation(async () => {
      controller.abort(new Error('cancel-during-launch'));
      return { close, version: () => 'fixture' } as unknown as Browser;
    });
    const metadata = vi.spyOn(provenance, 'collectAuditMetadata');
    await expect(runAudit({ rootDir: await root(), jobId: 'cancel', url: 'https://example.com/', configuration, signal: controller.signal })).rejects.toThrow('cancel-during-launch');
    expect(close).toHaveBeenCalledTimes(1);
    expect(metadata).not.toHaveBeenCalled();
  });

  it('closes the viewport context if Safe Mode installation fails', async () => {
    vi.spyOn(policy, 'assertPublicHttpUrl').mockResolvedValue(new URL('https://example.com/'));
    const contextClose = vi.fn(async () => undefined);
    const browserClose = vi.fn(async () => undefined);
    vi.spyOn(chromium, 'launch').mockResolvedValue({
      close: browserClose, version: () => 'fixture',
      newContext: async () => ({ close: contextClose } as unknown as BrowserContext),
    } as unknown as Browser);
    vi.spyOn(safety, 'installSafeMode').mockRejectedValue(new Error('safe-mode-failed'));
    vi.spyOn(reporting, 'writeReport').mockResolvedValue(undefined);
    const result = await runAudit({ rootDir: await root(), jobId: 'safety', url: 'https://example.com/', configuration });
    expect(result.status).toBe('FAILED');
    expect(result.captureFailures[0]?.error).toContain('safe-mode-failed');
    expect(contextClose).toHaveBeenCalledTimes(1);
    expect(browserClose).toHaveBeenCalledTimes(1);
  });

  it('renders a deterministic fixture and writes technical plus Manual Art Director evidence', async () => {
    // Replace only the test transport after installing real Safe Mode.
    // No production network policy or external provider is changed.
    vi.spyOn(policy, 'assertPublicHttpUrl').mockResolvedValue(new URL('https://example.com/'));
    const install = safety.installSafeMode;
    vi.spyOn(safety, 'installSafeMode').mockImplementation(async (context, runtime) => {
      await install(context, runtime);
      await context.route('https://example.com/**', async (route) => route.fulfill({
        status: 200, contentType: 'text/html',
        body: '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA Fixture</title><style>body{margin:0;padding:24px;font:18px Arial;color:#111;background:#fff}button{padding:16px}section{min-height:300px}</style></head><body><main><section><h1>QA Fixture</h1><p>A public deterministic page.</p><button type="button">Preview</button></section></main></body></html>',
      }));
    });
    const workRoot = await root();
    const result = await runAudit({ rootDir: workRoot, jobId: 'rendered-fixture', url: 'https://example.com/', configuration: {
      ...configuration, mode: 'CUSTOM', modules: ['VISUAL', 'RUNTIME', 'ACCESSIBILITY'],
      artDirection: { enabled: true, provider: 'MANUAL', mode: 'ECONOMY', layers: ['PREMIUM_QUALITY', 'VISUAL_HIERARCHY'], privateEvidenceAllowed: false, siteProfile: 'GENERIC' },
    } });
    expect(result.captures).toHaveLength(1);
    expect(result.captureFailures).toEqual([]);
    expect(result.captures[0]?.title).toBe('QA Fixture');
    expect(result.captures[0]?.geometry.horizontalOverflowPx).toBe(0);
    expect(result.captures[0]?.runtime.pageErrors).toEqual([]);
    expect(result.artDirection?.provider).toBe('MANUAL');
    expect(result.artDirection?.overallScore).toBeNull();
    const reportDir = path.dirname(result.reportAbsolutePath);
    for (const file of ['report.html', 'defects.json', 'candidates.json', 'root-cause-hypotheses.json', 'gpt-fix-prompt.txt', 'gpt-evidence.zip', 'art-direction.json', 'art-direction-evidence.json', 'image-review-board.html', 'gpt-premium-fix-prompt.txt']) {
      expect((await fs.stat(path.join(reportDir, file))).isFile()).toBe(true);
    }
    const files = await fs.readdir(path.join(reportDir, 'screenshots'));
    expect(files.some((file) => file.endsWith('.png'))).toBe(true);
  }, 30_000);

  it('repeats responsive overflow at its exact width and links its screenshot to the BUG', async () => {
    vi.spyOn(policy, 'assertPublicHttpUrl').mockResolvedValue(new URL('https://example.com/'));
    const install = safety.installSafeMode;
    vi.spyOn(safety, 'installSafeMode').mockImplementation(async (context, runtime) => {
      await install(context, runtime);
      await context.route('https://example.com/**', async (route) => route.fulfill({
        status: 200, contentType: 'text/html',
        body: '<!doctype html><html><head><style>body{margin:0}@media(max-width:330px){main{width:380px}}</style></head><body><main><h1>Fixture</h1></main></body></html>',
      }));
    });
    const workRoot = await root();
    await fs.writeFile(path.join(workRoot, 'configs', 'responsive-sweep.json'), JSON.stringify({
      enabledPreset: 'DEEP', start: 320, end: 340, step: 10, height: 700, settleMs: 10,
    }));
    const result = await runAudit({ rootDir: workRoot, jobId: 'responsive-exact', url: 'https://example.com/',
      configuration: { ...configuration, mode: 'RESPONSIVE', modules: ['RESPONSIVE'] } });
    const finding = result.responsiveSweep?.findings.find((item) => item.rule === 'responsive-overflow' && item.fromWidth === 320);
    expect(finding?.verification).toMatchObject({ status: 'CONFIRMED', width: 320, measuredOverflowPx: 60 });
    expect((await fs.readFile(finding!.verification!.screenshotPath!)).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const reportDir = path.dirname(result.reportAbsolutePath);
    const defects = JSON.parse(await fs.readFile(path.join(reportDir, 'defects.json'), 'utf8')) as Array<{ id: string; rule: string; viewports: string[] }>;
    expect(defects).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'responsive-overflow', viewports: ['320→320px'] })]));
    const zip = await fs.readFile(path.join(reportDir, 'gpt-evidence.zip'));
    expect(zip.includes(Buffer.from('responsive/width-320.png'))).toBe(true);
    expect(result.status).toBe('ISSUE');
  }, 30_000);

  it('keeps a non-reproduced responsive observation out of defects and PASS', async () => {
    vi.spyOn(policy, 'assertPublicHttpUrl').mockResolvedValue(new URL('https://example.com/'));
    const install = safety.installSafeMode;
    vi.spyOn(safety, 'installSafeMode').mockImplementation(async (context, runtime) => {
      await install(context, runtime);
      await context.route('https://example.com/**', async (route) => route.fulfill({
        status: 200, contentType: 'text/html', body: '<!doctype html><html><body><main>Stable page</main></body></html>',
      }));
    });
    vi.spyOn(responsive, 'runResponsiveSweep').mockResolvedValue({
      start: 320, end: 340, step: 10, height: 700, widthOnly: true,
      samples: [], unstableWidths: [], policyBlockedRequests: 0, validationFailedRequests: 0,
      findings: [{ rule: 'responsive-overflow', confidence: 'HIGH', fromWidth: 320, toWidth: 320,
        message: 'Initial observation', verification: { status: 'NOT_REPRODUCED', width: 320, measuredOverflowPx: 0 } }],
    });
    const result = await runAudit({ rootDir: await root(), jobId: 'responsive-unconfirmed', url: 'https://example.com/',
      configuration: { ...configuration, mode: 'RESPONSIVE', modules: ['RESPONSIVE'] } });
    expect(result.status).toBe('PARTIAL');
    const reportDir = path.dirname(result.reportAbsolutePath);
    expect(JSON.parse(await fs.readFile(path.join(reportDir, 'defects.json'), 'utf8'))).toEqual([]);
    expect(JSON.parse(await fs.readFile(path.join(reportDir, 'candidates.json'), 'utf8'))).toEqual([expect.objectContaining({ rule: 'responsive-overflow' })]);
  }, 30_000);
});
