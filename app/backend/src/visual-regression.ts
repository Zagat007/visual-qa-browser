import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { signWorkspaceSnapshot } from '../../../audit-engine/privacy/secret-store.js';
import type { AuditJob, AuditResult } from '../../../audit-engine/shared/types.js';

const ID = /^[a-f0-9-]{36}$/;
const PNG_MAGIC = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_IMAGE = 24 * 1024 * 1024;
const MAX_TOTAL = 160 * 1024 * 1024;
const MAX_COMPARISON_PIXELS = 120_000_000;
const MAX_DIFF_PIXELS = 24_000_000;
const COMPARE_TILE_HEIGHT = 512;
const sha = (data: Buffer) => crypto.createHash('sha256').update(data).digest('hex');

interface BaselineCapture {
  name: string;
  width: number;
  height: number;
  dpr: number;
  isMobile: boolean;
  hasTouch: boolean;
  documentWidth: number;
  documentHeight: number;
  bytes: number;
  sha256: string;
}
export interface VisualBaseline {
  schemaVersion: 1;
  id: string;
  auditId: string;
  url: string;
  createdAt: string;
  platform: string;
  browserVersion: string;
  captures: BaselineCapture[];
}
export interface VisualComparison {
  id: string;
  baselineId: string;
  auditId: string;
  status: 'REVIEW' | 'UNCHANGED' | 'NOT_COMPARABLE';
  items: Array<{
    viewport: string;
    status: 'REVIEW' | 'UNCHANGED' | 'NOT_COMPARABLE';
    reason?: string;
    differentPixels?: number;
    totalPixels?: number;
    ratio?: number;
    baselineUrl?: string;
    currentUrl?: string;
    diffUrl?: string;
  }>;
  note: string;
}

function baselineDir(root: string, id: string): string {
  if (!ID.test(id)) throw new Error('Invalid baseline ID.');
  return path.join(root, 'baselines', id);
}
function captureName(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name)) throw new Error('Unsafe viewport name.');
  return name;
}
async function readSummary(reportDir: string, job: AuditJob): Promise<AuditResult> {
  if (!job.reportUrl || !['PASS', 'ISSUE'].includes(job.status)) throw new Error('Нужен завершённый аудит со статусом PASS или ISSUE. PARTIAL/NOT_VERIFIED нельзя утверждать как эталон.');
  const result = JSON.parse(await fs.readFile(path.join(reportDir, 'summary.json'), 'utf8')) as AuditResult;
  if (result.jobId !== job.id || result.requestedUrl !== job.url) throw new Error('Audit summary does not match the selected job.');
  if (result.captureFailures.length || result.captures.length !== result.coverage.requestedViewports || !result.captures.length) {
    throw new Error('Baseline требует полного набора viewport screenshots без capture failures.');
  }
  return result;
}
async function captureBytes(reportDir: string, screenshotPath: string): Promise<Buffer> {
  const resolved = path.resolve(screenshotPath);
  if (!resolved.startsWith(`${reportDir}${path.sep}`)) throw new Error('Screenshot escapes report directory.');
  const relative = path.relative(reportDir, resolved);
  let current = reportDir;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error('Symlink screenshot is forbidden.');
  }
  const stat = await fs.lstat(resolved);
  if (!stat.isFile() || stat.size > MAX_IMAGE) throw new Error('Screenshot is not a supported regular PNG.');
  const bytes = await fs.readFile(resolved);
  if (!bytes.subarray(0, 8).equals(PNG_MAGIC)) throw new Error('Screenshot PNG signature is missing.');
  return bytes;
}
async function verifiedBaseline(root: string, id: string): Promise<VisualBaseline> {
  const dir = baselineDir(root, id);
  const raw = await fs.readFile(path.join(dir, 'baseline.json'));
  const seal = (await fs.readFile(path.join(dir, 'baseline.seal'), 'utf8')).trim();
  const expected = await signWorkspaceSnapshot(root, dir, sha(raw));
  if (!/^[a-f0-9]{64}$/.test(seal) || !crypto.timingSafeEqual(Buffer.from(seal, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new Error('BASELINE_CORRUPT: baseline metadata seal invalid.');
  }
  const baseline = JSON.parse(raw.toString('utf8')) as VisualBaseline;
  if (baseline.schemaVersion !== 1 || baseline.id !== id || !Array.isArray(baseline.captures) || baseline.captures.length > 32) throw new Error('BASELINE_CORRUPT: metadata invalid.');
  return baseline;
}
export async function approveVisualBaseline(root: string, job: AuditJob, reportDir: string): Promise<VisualBaseline> {
  const result = await readSummary(reportDir, job);
  if (result.captures.length > 32) throw new Error('Too many captures for baseline.');
  const id = crypto.randomUUID();
  const parent = path.join(root, 'baselines');
  await fs.mkdir(parent, { recursive: true });
  const staging = await fs.mkdtemp(path.join(parent, '.pending-'));
  let total = 0;
  try {
    const captures: BaselineCapture[] = [];
    for (const capture of result.captures) {
      const name = captureName(capture.viewport.name);
      const bytes = await captureBytes(reportDir, capture.screenshotPath);
      total += bytes.length;
      if (total > MAX_TOTAL) throw new Error('Baseline screenshots exceed 160 MiB.');
      const file = path.join(staging, `${name}.png`);
      await fs.writeFile(file, bytes, { flag: 'wx' });
      if (sha(await fs.readFile(file)) !== sha(bytes)) throw new Error('Baseline copy verification failed.');
      captures.push({
        name, width: capture.viewport.width, height: capture.viewport.height,
        dpr: capture.viewport.deviceScaleFactor, isMobile: capture.viewport.isMobile, hasTouch: capture.viewport.hasTouch,
        documentWidth: capture.documentSize.width, documentHeight: capture.documentSize.height,
        bytes: bytes.length, sha256: sha(bytes),
      });
    }
    const baseline: VisualBaseline = {
      schemaVersion: 1, id, auditId: job.id, url: result.requestedUrl, createdAt: new Date().toISOString(),
      platform: process.platform, browserVersion: result.metadata.browserVersion, captures,
    };
    const finalDir = baselineDir(root, id);
    const raw = Buffer.from(`${JSON.stringify(baseline, null, 2)}\n`);
    await fs.writeFile(path.join(staging, 'baseline.json'), raw);
    await fs.writeFile(path.join(staging, 'baseline.seal'), `${await signWorkspaceSnapshot(root, finalDir, sha(raw))}\n`);
    await fs.rename(staging, finalDir);
    return baseline;
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
export async function listVisualBaselines(root: string, url: string): Promise<VisualBaseline[]> {
  let names: string[];
  try { names = await fs.readdir(path.join(root, 'baselines')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const baselines: VisualBaseline[] = [];
  for (const name of names) {
    if (!ID.test(name)) continue;
    try { const baseline = await verifiedBaseline(root, name); if (baseline.url === url) baselines.push(baseline); }
    catch { /* Corrupt/unrelated baselines are never promoted to valid choices. */ }
  }
  return baselines.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function baselineImage(root: string, id: string, viewport: string): Promise<Buffer> {
  const baseline = await verifiedBaseline(root, id);
  const capture = baseline.captures.find((item) => item.name === captureName(viewport));
  if (!capture) throw new Error('Viewport not present in baseline.');
  const file = path.join(baselineDir(root, id), `${capture.name}.png`);
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== capture.bytes) throw new Error('BASELINE_CORRUPT: screenshot changed.');
  const bytes = await fs.readFile(file);
  if (sha(bytes) !== capture.sha256) throw new Error('BASELINE_CORRUPT: screenshot hash mismatch.');
  return bytes;
}

async function comparePngs(page: import('playwright').Page, before: Buffer, after: Buffer): Promise<{
  differentPixels: number; totalPixels: number; diff?: Buffer; diffOmittedReason?: string;
}> {
  const result = await page.evaluate(async ({ left, right, maxPixels, maxDiffPixels, tileHeight }) => {
    const decode = async (base64: string): Promise<ImageBitmap> => {
      const raw = atob(base64);
      const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
      return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    };
    const a = await decode(left); const b = await decode(right);
    const width = Math.max(a.width, b.width); const height = Math.max(a.height, b.height);
    const totalPixels = width * height;
    if (totalPixels > maxPixels) {
      a.close(); b.close();
      throw new Error(`Screenshots exceed the ${Math.round(maxPixels / 1_000_000)} million pixel safety limit.`);
    }

    const strip = document.createElement('canvas');
    strip.width = width;
    strip.height = Math.min(tileHeight, height);
    const context = strip.getContext('2d', { willReadFrequently: true });
    if (!context) { a.close(); b.close(); throw new Error('Canvas is unavailable.'); }

    const buildDiff = totalPixels <= maxDiffPixels && width <= 16_384 && height <= 32_767;
    const diffCanvas = buildDiff ? document.createElement('canvas') : null;
    const diffContext = diffCanvas?.getContext('2d') ?? null;
    if (diffCanvas) { diffCanvas.width = width; diffCanvas.height = height; }

    let changed = 0;
    for (let y = 0; y < height; y += tileHeight) {
      const h = Math.min(tileHeight, height - y);
      if (strip.height !== h) strip.height = h;
      const ctx = strip.getContext('2d', { willReadFrequently: true });
      if (!ctx) { a.close(); b.close(); throw new Error('Canvas is unavailable.'); }
      ctx.clearRect(0, 0, width, h);
      ctx.drawImage(a, 0, -y);
      const oldPixels = ctx.getImageData(0, 0, width, h).data;
      ctx.clearRect(0, 0, width, h);
      ctx.drawImage(b, 0, -y);
      const newPixels = ctx.getImageData(0, 0, width, h).data;
      const diff = buildDiff ? ctx.createImageData(width, h) : null;
      for (let i = 0; i < oldPixels.length; i += 4) {
        const x = (i / 4) % width;
        const row = Math.floor(i / 4 / width) + y;
        const outside = x >= a.width || row >= a.height || x >= b.width || row >= b.height;
        const delta = Math.max(
          Math.abs(oldPixels[i]! - newPixels[i]!),
          Math.abs(oldPixels[i + 1]! - newPixels[i + 1]!),
          Math.abs(oldPixels[i + 2]! - newPixels[i + 2]!),
          Math.abs(oldPixels[i + 3]! - newPixels[i + 3]!),
        );
        const isChanged = outside || delta > 20;
        if (isChanged) changed++;
        if (diff) {
          if (isChanged) {
            diff.data[i] = 245; diff.data[i + 1] = 65; diff.data[i + 2] = 72; diff.data[i + 3] = 255;
          } else {
            diff.data[i] = newPixels[i]!; diff.data[i + 1] = newPixels[i + 1]!;
            diff.data[i + 2] = newPixels[i + 2]!; diff.data[i + 3] = 70;
          }
        }
      }
      if (diff && diffContext) diffContext.putImageData(diff, 0, y);
    }
    a.close(); b.close();
    return {
      differentPixels: changed,
      totalPixels,
      png: diffCanvas ? diffCanvas.toDataURL('image/png').split(',')[1]! : null,
      diffOmittedReason: diffCanvas ? null : 'Очень длинный full-page снимок сравнен порциями; общая diff-карта пропущена для защиты памяти.',
    };
  }, {
    left: before.toString('base64'), right: after.toString('base64'),
    maxPixels: MAX_COMPARISON_PIXELS, maxDiffPixels: MAX_DIFF_PIXELS, tileHeight: COMPARE_TILE_HEIGHT,
  });
  return {
    differentPixels: result.differentPixels,
    totalPixels: result.totalPixels,
    ...(result.png ? { diff: Buffer.from(result.png, 'base64') } : {}),
    ...(result.diffOmittedReason ? { diffOmittedReason: result.diffOmittedReason } : {}),
  };
}

export async function compareVisualBaseline(root: string, job: AuditJob, reportDir: string, id: string): Promise<VisualComparison> {
  const result = await readSummary(reportDir, job);
  const baseline = await verifiedBaseline(root, id);
  if (baseline.url !== result.requestedUrl) throw new Error('BASELINE_MISMATCH: audited URL differs.');
  const comparisonId = crypto.randomUUID();
  const output = path.join(reportDir, 'visual-comparisons', comparisonId);
  await fs.mkdir(output, { recursive: true });
  const items: VisualComparison['items'] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const capture of result.captures) {
      const name = captureName(capture.viewport.name);
      const previous = baseline.captures.find((item) => item.name === name);
      const item: VisualComparison['items'][number] = { viewport: name, status: 'NOT_COMPARABLE' };
      items.push(item);
      if (!previous) { item.reason = 'Viewport отсутствует в эталоне.'; continue; }
      if (baseline.platform !== process.platform || baseline.browserVersion !== result.metadata.browserVersion ||
        previous.width !== capture.viewport.width || previous.height !== capture.viewport.height ||
        previous.dpr !== capture.viewport.deviceScaleFactor || previous.isMobile !== capture.viewport.isMobile ||
        previous.hasTouch !== capture.viewport.hasTouch) {
        item.reason = 'ОС, версия браузера или настройки viewport не совпадают с эталоном.';
        continue;
      }
      try {
        const before = await baselineImage(root, id, name);
        const after = await captureBytes(reportDir, capture.screenshotPath);
        const comparison = await comparePngs(page, before, after);
        item.status = comparison.differentPixels ? 'REVIEW' : 'UNCHANGED';
        item.differentPixels = comparison.differentPixels;
        item.totalPixels = comparison.totalPixels;
        item.ratio = comparison.differentPixels / comparison.totalPixels;
        item.baselineUrl = `/api/visual-baselines/${id}/images/${name}`;
        item.currentUrl = `/reports/${path.relative(path.join(root, 'reports'), capture.screenshotPath).split(path.sep).join('/')}`;
        if (comparison.diffOmittedReason) item.reason = comparison.diffOmittedReason;
        if (comparison.differentPixels && comparison.diff) {
          const diffName = `${name}-diff.png`;
          await fs.writeFile(path.join(output, diffName), comparison.diff);
          item.diffUrl = `/reports/${path.relative(path.join(root, 'reports'), path.join(output, diffName)).split(path.sep).join('/')}`;
        }
      } catch (error) { item.reason = error instanceof Error ? error.message : 'Сравнение не удалось.'; }
    }
  } finally { await browser.close(); }
  const expected = new Set(baseline.captures.map((item) => item.name));
  for (const item of items) expected.delete(item.viewport);
  for (const name of expected) items.push({ viewport: name, status: 'NOT_COMPARABLE', reason: 'Viewport отсутствует в новом аудите.' });
  const status = items.some((item) => item.status === 'NOT_COMPARABLE') ? 'NOT_COMPARABLE'
    : items.some((item) => item.status === 'REVIEW') ? 'REVIEW' : 'UNCHANGED';
  const response: VisualComparison = {
    id: comparisonId, baselineId: id, auditId: job.id, status, items,
    note: 'Пиксельное различие — кандидат на ручной просмотр, не BUG. Порог: изменение любого канала >20/255. Сравниваются только совпадающие ОС, Chromium и viewport.',
  };
  await fs.writeFile(path.join(output, 'comparison.json'), `${JSON.stringify(response, null, 2)}\n`);
  return response;
}
