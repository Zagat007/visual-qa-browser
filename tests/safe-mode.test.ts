import { afterEach, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { attachRuntimeCollector } from '../audit-engine/runtime/collector';
import { installSafeMode } from '../audit-engine/security/safe-mode';

const BROWSER_TEST_TIMEOUT_MS = 30_000;

let browser: Browser | null = null;
afterEach(async () => { await browser?.close(); browser = null; });

describe('context Safe Mode', () => {
  it('blocks mutation, private-network and WebSocket traffic at context scope', async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    let runtime: ReturnType<typeof attachRuntimeCollector> | null = null;
    await installSafeMode(context, () => {
      if (!runtime) throw new Error('Safe Mode runtime is not bound.');
      return runtime;
    });
    const page = await context.newPage();
    runtime = attachRuntimeCollector(page);
    await page.setContent('<!doctype html><body>safe</body>');
    await page.evaluate(async () => {
      await fetch('https://example.com/mutate', { method: 'POST' }).catch(() => undefined);
      await fetch('https://example.com/webdav', { method: 'PROPFIND' }).catch(() => undefined);
      await fetch('http://127.0.0.1/private').catch(() => undefined);
      await fetch('https://example.com/logout').catch(() => undefined);
      const ws = new WebSocket('wss://example.com/ws');
      await new Promise((resolve) => { ws.addEventListener('close', resolve, { once: true }); setTimeout(resolve, 1000); });
    });
    const kinds = runtime.network.map((entry) => entry.kind);
    expect(kinds).toContain('skipped-safely');
    expect(kinds).toContain('blocked-private-network');
    expect(kinds).toContain('websocket-blocked');
    expect(runtime.network.some((entry) => entry.method === 'PROPFIND' && entry.reason?.includes('non-read-only'))).toBe(true);
    expect(runtime.network.some((entry) => entry.reason?.includes('destructive GET'))).toBe(true);
    await context.close();
  }, BROWSER_TEST_TIMEOUT_MS);

  it('treats a cancelled media preload as neutral evidence', async () => {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const runtime = attachRuntimeCollector(page);
    await page.route('**/demo.mp3', async (route) => route.abort('aborted'));
    await page.setContent('<audio id="demo" preload="auto" src="https://media.example.test/demo.mp3"></audio>', { waitUntil: 'load' });
    await page.locator('#demo').evaluate((element) => (element as HTMLAudioElement).load());
    await page.waitForTimeout(100);
    const entry = runtime.network.find((item) => item.url.includes('/demo.mp3'));
    expect(entry).toMatchObject({ kind: 'benign-abort', resourceType: 'media' });
    await context.close();
  }, BROWSER_TEST_TIMEOUT_MS);
});
