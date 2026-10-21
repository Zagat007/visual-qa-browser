import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';

const root = process.cwd();
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-runtime-'));
const evidenceDir = path.resolve(process.env.VQB_SMOKE_EVIDENCE_DIR ?? path.join(root, 'audits', 'runtime-smoke'));
let child;
let browser;
let logs = '';
let serverExit;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const screenshots = [];
const pageErrors = [];
const checks = [];
try {
  await fs.mkdir(evidenceDir, { recursive: true });
  const lighthouseWorkerBuild = path.join(root, 'dist', 'server', 'lighthouse-worker-entry.js');
  assert.equal((await fs.stat(lighthouseWorkerBuild)).isFile(), true, 'Production Lighthouse isolate worker is missing from dist/server.');
  checks.push('compiled Lighthouse isolate worker');
  await fs.cp(path.join(root, 'dist'), path.join(temp, 'dist'), { recursive: true });
  await fs.cp(path.join(root, 'configs'), path.join(temp, 'configs'), { recursive: true });
  // Exercise crash recovery without touching the user's real jobs or port 4210.
  const recoveryId = crypto.randomUUID();
  const recoveryDir = path.join(temp, 'checkpoints', recoveryId);
  await fs.mkdir(recoveryDir, { recursive: true });
  await fs.writeFile(path.join(recoveryDir, 'audit-state.json'), JSON.stringify({
    id: recoveryId, url: 'https://example.com/', preset: 'QUICK', status: 'RUNNING',
    configuration: { mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'QUICK' },
    createdAt: new Date().toISOString(), completedCaptures: 0, totalCaptures: 2,
  }));
  const visualId = crypto.randomUUID();
  const visualCheckpoint = path.join(temp, 'checkpoints', visualId);
  const visualReport = path.join(temp, 'reports', visualId);
  await fs.mkdir(visualCheckpoint, { recursive: true });
  await fs.mkdir(path.join(visualReport, 'screenshots'), { recursive: true });
  await fs.writeFile(path.join(visualCheckpoint, 'audit-state.json'), JSON.stringify({
    id: visualId, url: 'https://example.test/', preset: 'QUICK', status: 'PASS',
    reportUrl: `/reports/${visualId}/report.html`,
    configuration: { mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'QUICK' },
    createdAt: new Date().toISOString(), completedCaptures: 1, totalCaptures: 1,
  }));
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  const base = `http://127.0.0.1:${port}`;
  const instanceId = crypto.createHash('sha256').update(path.resolve(temp).replace(/[\\/]+$/, '').toLowerCase()).digest('hex').slice(0, 24);
  child = spawn(process.execPath, [path.join(root, 'dist/server/index.js'), `--vqb-instance=${instanceId}`], {
    cwd: temp, env: { ...process.env, PORT: String(port), VQB_ROOT: temp },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  serverExit = new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.once('error', (error) => { logs += error.message; resolve({ error }); });
  });
  let health;
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`Production server exited before health check.\n${logs}`);
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) { health = await response.json(); break; }
    } catch { /* bounded startup retry */ }
    await sleep(100);
  }
  assert.equal(health?.ok, true, `Production server failed startup.\n${logs}`);
  assert.equal(health.pid, child.pid);
  assert.equal(health.instanceId, instanceId);
  checks.push('PID + installation identity health');
  const capabilities = await (await fetch(`${base}/api/capabilities`)).json();
  assert.equal(capabilities.safeMode, true);
  assert.equal(capabilities.viewports.length, 16);
  assert.ok(capabilities.artDirector.providers.some((provider) => provider.id === 'MANUAL' && provider.configured));
  const diagnostics = await (await fetch(`${base}/api/diagnostics/jobs`)).json();
  assert.equal(diagnostics.activeCount, 0);
  assert.equal(diagnostics.queueLength, 0);
  const recovered = await (await fetch(`${base}/api/audits/${recoveryId}`)).json();
  assert.equal(recovered.status, 'NOT_VERIFIED');
  assert.equal(recovered.currentStage, 'recovery-interrupted');
  checks.push('capabilities + scheduler + crash recovery');
  const crossOrigin = await fetch(`${base}/api/health`, { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(crossOrigin.status, 403);
  const badTarget = await fetch(`${base}/api/audits`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'http://127.0.0.1/', configuration: { mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'QUICK' } }),
  });
  assert.equal(badTarget.status, 400);
  assert.equal((await (await fetch(`${base}/api/audits`)).json()).length, 2);
  const missingApi = await fetch(`${base}/api/definitely-missing`);
  assert.equal(missingApi.status, 404);
  assert.match(missingApi.headers.get('content-type') ?? '', /application\/json/);
  assert.equal((await missingApi.json()).error, 'API endpoint not found.');
  checks.push('cross-origin + private-network rejection + API fail-closed 404');

  const disposableProject = path.join(temp, 'disposable-project');
  await fs.mkdir(disposableProject);
  await fs.writeFile(path.join(disposableProject, 'source.ts'), 'export const value = 1;\n');
  const jsonPost = (url, body) => fetch(`${base}${url}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const inspectionResponse = await jsonPost('/api/workspace/inspect', { projectRoot: disposableProject });
  assert.equal(inspectionResponse.status, 200);
  assert.equal((await inspectionResponse.json()).fileCount, 1);
  const backupsResponse = await jsonPost('/api/fixes/backups', { projectRoot: disposableProject });
  assert.equal(backupsResponse.status, 200);
  assert.deepEqual((await backupsResponse.json()).backups, []);
  const noEvidence = await jsonPost(`/api/audits/${recoveryId}/fix-pack`, { projectRoot: disposableProject });
  assert.equal(noEvidence.status, 400);
  const invalidZip = await fetch(`${base}/api/fixes/apply?projectRoot=${encodeURIComponent(disposableProject)}`, {
    method: 'POST', headers: { 'content-type': 'application/zip' }, body: Buffer.from('not-a-zip'),
  });
  assert.equal(invalidZip.status, 400);
  const invalidRollback = await jsonPost('/api/fixes/rollback', { projectRoot: disposableProject, backupId: '../escape' });
  assert.equal(invalidRollback.status, 400);
  assert.equal(await fs.readFile(path.join(disposableProject, 'source.ts'), 'utf8'), 'export const value = 1;\n');
  checks.push('Fix Bridge API inspection, backup discovery, evidence gate, invalid ZIP and rollback rejection');

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const visualScreenshot = path.join(visualReport, 'screenshots', 'test-mobile.png');
  await page.setContent('<html><body style="background:#2468a0"><h1>Baseline fixture</h1></body></html>');
  await page.screenshot({ path: visualScreenshot });
  await fs.writeFile(path.join(visualReport, 'summary.json'), JSON.stringify({
    jobId: visualId, requestedUrl: 'https://example.test/', metadata: { browserVersion: browser.version() },
    captureFailures: [], coverage: { requestedViewports: 1 },
    captures: [{ screenshotPath: visualScreenshot, viewport: { name: 'test-mobile', width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false }, documentSize: { width: 1280, height: 720 } }],
  }));
  const approval = await jsonPost('/api/visual-baselines/approve', { auditId: visualId });
  assert.equal(approval.status, 200);
  const baseline = await approval.json();
  const listed = await (await jsonPost('/api/visual-baselines/list', { url: 'https://example.test/' })).json();
  assert.equal(listed[0]?.id, baseline.id);
  const same = await jsonPost('/api/visual-baselines/compare', { auditId: visualId, baselineId: baseline.id });
  assert.equal(same.status, 200);
  assert.equal((await same.json()).status, 'UNCHANGED');
  const baselineImage = await fetch(`${base}/api/visual-baselines/${baseline.id}/images/test-mobile`);
  assert.equal(baselineImage.status, 200);
  assert.equal(baselineImage.headers.get('content-type'), 'image/png');
  const invalidScenario = await jsonPost('/api/scenarios/run', { name: 'Unsafe local URL', url: 'http://127.0.0.1/', viewport: { width: 390, height: 844 }, steps: [{ action: 'assertVisible', selector: 'h1' }] });
  assert.equal(invalidScenario.status, 400);
  checks.push('approved baseline, list, PNG, same-image comparison and private-target scenario refusal');
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await page.goto(base, { waitUntil: 'networkidle', timeout: 20_000 });
  assert.equal(response?.status(), 200);
  await page.getByRole('heading', { name: 'Проверка сайта без ложного PASS.', exact: true }).waitFor();
  assert.equal(await page.locator('.brandIdentity').getByText('Visual QA Browser', { exact: true }).count(), 1);
  assert.equal(await page.getByRole('region', { name: 'Визуальное сравнение' }).count(), 1);
  assert.equal(await page.getByRole('region', { name: 'Пользовательские сценарии' }).count(), 1);
  assert.equal(await page.locator('.hardwareCard').count(), 1);
  assert.equal(await page.locator('.warning').count(), 0);
  const run = page.locator('.runButton');
  assert.equal(await run.isEnabled(), true);
  await page.locator('.quickWorkflow').filter({ hasText: 'Deep Visual' }).click();
  assert.match(await page.locator('.commandSummary').innerText(), /Все размеры/);
  await page.locator('.viewportPresetGrid .choiceSelect').filter({ hasText: 'Своё разрешение' }).click();
  await page.getByLabel('Ширина', { exact: true }).fill('390');
  await page.getByLabel('Высота', { exact: true }).fill('844');
  assert.equal(await run.isEnabled(), true);
  await page.getByLabel('Ширина', { exact: true }).fill('239');
  assert.equal(await run.isEnabled(), false);
  await page.getByLabel('Ширина', { exact: true }).fill('390');
  await page.getByRole('checkbox').check();
  assert.equal(await page.locator('.artLayerCard').count(), 11);
  assert.equal(await run.isEnabled(), true);
  await page.locator('.providerGrid .choiceSelect').filter({ hasText: 'Manual / ChatGPT export' }).click();
  checks.push('rendered UI + presets + custom dimensions + Manual Art Director');
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(async () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.waitForFunction(() => window.scrollY === 0);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `Command Center horizontal overflow at ${width}px: ${overflow}px.`);
    const filename = `${width}x${height}.png`;
    await page.screenshot({ path: path.join(evidenceDir, filename), fullPage: true, animations: 'disabled' });
    await page.screenshot({ path: path.join(evidenceDir, `${width}x${height}-viewport.png`), animations: 'disabled' });
    screenshots.push(filename);
  }
  assert.deepEqual(pageErrors, []);
  checks.push('four viewport renders without horizontal overflow or JS page errors');
  await fs.writeFile(path.join(evidenceDir, 'result.json'), JSON.stringify({
    status: 'PASS', platform: process.platform, node: process.versions.node,
    chromium: browser.version(), checks, screenshots,
    scope: 'Production server, local API, rendered configuration UI. No external AI calls or target-site audits.',
  }, null, 2));
  console.log(`[PASS] RUNTIME_SMOKE: ${checks.join('; ')}`);
} catch (error) {
  await fs.writeFile(path.join(evidenceDir, 'failure.log'), `${error?.stack ?? error}\n${logs}`).catch(() => undefined);
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
  if (child && serverExit && child.exitCode === null) {
    child.kill('SIGTERM');
    const exited = await Promise.race([serverExit, sleep(6_000).then(() => null)]);
    if (!exited) {
      child.kill('SIGKILL');
      await Promise.race([serverExit, sleep(3_000)]);
    }
  }
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
