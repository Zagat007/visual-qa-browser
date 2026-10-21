import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { afterEach, describe, expect, it } from 'vitest';
import { approveVisualBaseline, baselineImage, compareVisualBaseline, listVisualBaselines } from '../app/backend/src/visual-regression';
import { executeScenarioStep } from '../audit-engine/scenarios/run-scenario';
import type { AuditJob, AuditResult } from '../audit-engine/shared/types';

const roots: string[] = [];
afterEach(async () => { for (const dir of roots.splice(0)) await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-visual-'));
  roots.push(root);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
  const url = 'https://example.test/';
  const makeReport = async (jobId: string, color: string) => {
    const reportDir = path.join(root, 'reports', jobId);
    await fs.mkdir(path.join(reportDir, 'screenshots'), { recursive: true });
    await page.setContent(`<html><body style="margin:0;background:${color}"><h1>Test</h1></body></html>`);
    const screenshotPath = path.join(reportDir, 'screenshots', 'mobile-320.png');
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: 'disabled' });
    const job = {
      id: jobId, url, status: 'PASS', reportUrl: `/reports/${jobId}/report.html`,
    } as AuditJob;
    const result = {
      jobId, requestedUrl: url, metadata: { browserVersion: browser.version() },
      captureFailures: [], coverage: { requestedViewports: 1 },
      captures: [{
        screenshotPath, viewport: { name: 'mobile-320', width: 320, height: 240, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
        documentSize: { width: 320, height: 240 },
      }],
    } as unknown as AuditResult;
    await fs.writeFile(path.join(reportDir, 'summary.json'), JSON.stringify(result));
    return { job, reportDir, screenshotPath };
  };
  return { root, browser, page, makeReport };
}

describe('approved baseline and safe user journey', () => {
  it('requires explicit complete evidence, compares exact and changed images, and retains immutable baseline', async () => {
    const f = await fixture();
    try {
      const original = await f.makeReport(crypto.randomUUID(), '#111111');
      const approved = await approveVisualBaseline(f.root, original.job, original.reportDir);
      expect(approved.captures).toHaveLength(1);
      expect((await listVisualBaselines(f.root, original.job.url))[0]?.id).toBe(approved.id);
      const locked = await baselineImage(f.root, approved.id, 'mobile-320');
      const repeat = await f.makeReport(crypto.randomUUID(), '#111111');
      const unchanged = await compareVisualBaseline(f.root, repeat.job, repeat.reportDir, approved.id);
      expect(unchanged.status).toBe('UNCHANGED');
      expect(unchanged.items[0]?.differentPixels).toBe(0);
      const changed = await f.makeReport(crypto.randomUUID(), '#cc0000');
      const review = await compareVisualBaseline(f.root, changed.job, changed.reportDir, approved.id);
      expect(review.status).toBe('REVIEW');
      expect(review.items[0]?.differentPixels).toBeGreaterThan(10_000);
      expect(review.items[0]?.diffUrl).toContain('-diff.png');
      expect(await baselineImage(f.root, approved.id, 'mobile-320')).toEqual(locked);
    } finally { await f.browser.close(); }
  });

  it('refuses incomplete captures and tampered baseline image/manifest', async () => {
    const f = await fixture();
    try {
      const data = await f.makeReport(crypto.randomUUID(), '#111111');
      const unfinished = { ...data.job, status: 'RUNNING' } as AuditJob;
      await expect(approveVisualBaseline(f.root, unfinished, data.reportDir)).rejects.toThrow(/завершённый/);
      const partial = { ...data.job, status: 'PARTIAL' } as AuditJob;
      await expect(approveVisualBaseline(f.root, partial, data.reportDir)).rejects.toThrow(/PARTIAL/);
      const baseline = await approveVisualBaseline(f.root, data.job, data.reportDir);
      await fs.writeFile(path.join(f.root, 'baselines', baseline.id, 'mobile-320.png'), 'corrupt');
      await expect(baselineImage(f.root, baseline.id, 'mobile-320')).rejects.toThrow(/BASELINE_CORRUPT/);
      await fs.writeFile(path.join(f.root, 'baselines', baseline.id, 'baseline.json'), '{}');
      await expect(baselineImage(f.root, baseline.id, 'mobile-320')).rejects.toThrow(/BASELINE_CORRUPT/);
    } finally { await f.browser.close(); }
  });

  it('marks mismatched browser conditions and missing viewports NOT_COMPARABLE', async () => {
    const f = await fixture();
    try {
      const data = await f.makeReport(crypto.randomUUID(), '#111111');
      const baseline = await approveVisualBaseline(f.root, data.job, data.reportDir);
      const other = await f.makeReport(crypto.randomUUID(), '#cc0000');
      const summaryPath = path.join(other.reportDir, 'summary.json');
      const result = JSON.parse(await fs.readFile(summaryPath, 'utf8')) as AuditResult;
      result.metadata.browserVersion = 'different-browser';
      await fs.writeFile(summaryPath, JSON.stringify(result));
      const comparison = await compareVisualBaseline(f.root, other.job, other.reportDir, baseline.id);
      expect(comparison.status).toBe('NOT_COMPARABLE');
      expect(comparison.items[0]?.diffUrl).toBeUndefined();
    } finally { await f.browser.close(); }
  });

  it('executes only explicit safe state, assertions and test-field changes', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(`<button id="menu" aria-expanded="false" aria-controls="panel" onclick="this.setAttribute('aria-expanded','true');document.querySelector('#panel').hidden=false">Menu</button>
        <div id="panel" hidden>Content <input id="query" type="text"><input id="choice" type="checkbox"></div>
        <button id="pay">Pay now</button><a id="link" href="https://example.test/next">Next</a><form><button id="submit">Submit</button></form>`);
      expect((await executeScenarioStep(page, { action: 'click', selector: '#menu' })).status).toBe('PASS');
      expect((await executeScenarioStep(page, { action: 'assertVisible', selector: '#panel' })).status).toBe('PASS');
      expect((await executeScenarioStep(page, { action: 'fill', selector: '#query', value: 'qa-test' })).status).toBe('PASS');
      expect((await executeScenarioStep(page, { action: 'check', selector: '#choice' })).status).toBe('PASS');
      expect((await executeScenarioStep(page, { action: 'assertText', selector: '#panel', expected: 'Content' })).status).toBe('PASS');
      expect((await executeScenarioStep(page, { action: 'click', selector: '#pay' })).status).toBe('SKIPPED_SAFELY');
      expect((await executeScenarioStep(page, { action: 'click', selector: '#link' })).status).toBe('SKIPPED_SAFELY');
      expect((await executeScenarioStep(page, { action: 'click', selector: '#submit' })).status).toBe('SKIPPED_SAFELY');
      expect((await executeScenarioStep(page, { action: 'assertVisible', selector: 'button' })).status).toBe('ISSUE');
      await page.setContent(`<div id="visible-parent">Visible <span id="opacity-zero" style="opacity:0">Hidden secret</span></div>
        <div id="delayed" style="display:none">Delayed text</div>
        <script>
          setTimeout(() => { document.querySelector('#delayed').style.display='block'; }, 120);
          setTimeout(() => { const node = document.createElement('div'); node.id='inserted-later'; node.textContent='Inserted later'; document.body.appendChild(node); }, 160);
        </script>`);
      expect((await executeScenarioStep(page, { action: 'assertText', selector: '#visible-parent', expected: 'Hidden secret' })).status).toBe('ISSUE');
      expect((await executeScenarioStep(page, { action: 'assertVisible', selector: '#opacity-zero' })).status).toBe('ISSUE');
      expect((await executeScenarioStep(page, { action: 'assertVisible', selector: '#delayed' })).status).toBe('PASS');
      expect((await executeScenarioStep(page, { action: 'assertText', selector: '#delayed', expected: 'Delayed text' })).status).toBe('PASS');
      expect((await executeScenarioStep(page, { action: 'assertVisible', selector: '#inserted-later' })).status).toBe('PASS');
      expect((await executeScenarioStep(page, { action: 'assertText', selector: '#inserted-later', expected: 'Inserted later' })).status).toBe('PASS');
    } finally { await browser.close(); }
  });
});
