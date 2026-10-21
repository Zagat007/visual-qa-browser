import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyFixPackage, buildChatGptFixPack, inspectWorkspace, readZipEntries, rollbackFix } from '../app/backend/src/fix-workflow';
import { signWorkspaceSnapshot } from '../audit-engine/privacy/secret-store';
import { sanitizeExternalArtifact } from '../audit-engine/privacy/redaction';
import { storedZip } from '../audit-engine/reporting/zip';
import type { AuditJob } from '../audit-engine/shared/types';

const roots: string[] = [];
const digest = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-r14-'));
  roots.push(root);
  const project = path.join(root, 'project');
  await fs.mkdir(path.join(project, 'src'), { recursive: true });
  await fs.writeFile(path.join(project, 'src', 'first.ts'), 'export const first = 1;\n');
  await fs.writeFile(path.join(project, 'src', 'second.ts'), 'export const second = 1;\n');
  const report = path.join(root, 'report');
  await fs.mkdir(report);
  await fs.writeFile(path.join(report, 'gpt-evidence.zip'), storedZip([{ name: 'defects.json', content: Buffer.from('[]') }]));
  await fs.writeFile(path.join(report, 'gpt-fix-prompt.txt'), 'prompt');
  return { root, project, report };
}

async function packageFor(root: string, project: string, operations: Array<{ id: string; action: 'create' | 'replace'; path: string; content: Buffer; before?: Buffer }>): Promise<Buffer> {
  const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
  const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
  return storedZip([
    { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({
      schemaVersion: 2, fixId: 'r14-regression', summary: 'adversarial fixture', sourcePackFingerprint, sourcePackBinding,
      operations: operations.map((item) => ({
        id: item.id, action: item.action, path: item.path, archiveEntry: `files/${item.id}.txt`,
        ...(item.before ? { beforeSha256: digest(item.before) } : {}), afterSha256: digest(item.content),
      })),
    })) },
    ...operations.map((item) => ({ name: `files/${item.id}.txt`, content: item.content })),
  ]);
}

describe('r14 independent security regressions', () => {
  it('omits generic credentials and service folders, while retaining explicit placeholders', async () => {
    const { project } = await setup();
    const samples: Record<string, string> = {
      'short.yaml': 'token: "abc"\n',
      'settings.json': '{"session":"short","password":"a"}',
      'header.ts': 'const auth = "Authorization: Bearer abcd1234";',
      'basic-header.ts': 'const auth = "Authorization: Basic dXNlcjpwYXNz";',
      'x-api-key.ts': 'const headers = { "X-API-Key": "actual-api-secret" };',
      'set-cookie.ts': 'const header = "Set-Cookie: SID=actual_secret; HttpOnly";',
      'cookie.ini': 'Cookie: SID=actual_secret',
      'database.ts': 'const db = "mysql://alice:pwd1234@localhost/db";',
      'url.ts': 'const endpoint = "https://example.test/page?token=ACTUAL_SECRET";',
      'safe.ts': 'export const token = process.env.API_KEY;\nexport const example = "<TOKEN>";\nexport const key = "YOUR_API_KEY";',
    };
    for (const [name, value] of Object.entries(samples)) await fs.writeFile(path.join(project, 'src', name), value);
    await fs.mkdir(path.join(project, 'fix-backups'));
    await fs.writeFile(path.join(project, 'fix-backups', 'history.ts'), 'export const secret = "hidden";');
    const inspection = await inspectWorkspace(project);
    const job: AuditJob = {
      id: 'done', url: 'https://example.test/page?foo=SECRET_VALUE#private', preset: 'QUICK',
      status: 'ISSUE', createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      reportUrl: '/reports/done/report.html', configuration: { mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'QUICK' },
    };
    const { root, report } = { root: path.dirname(project), report: path.join(path.dirname(project), 'report') };
    const pack = readZipEntries((await buildChatGptFixPack(root, project, report, job)).buffer);
    const manifest = JSON.parse(pack.get('workspace-manifest.json')!.toString()) as { files: Array<{ path: string }> };
    const names = manifest.files.map((item) => item.path);
    expect(names).toContain('src/safe.ts');
    for (const name of Object.keys(samples).filter((name) => name !== 'safe.ts')) expect(names).not.toContain(`src/${name}`);
    expect(names.some((name) => name.startsWith('fix-backups/'))).toBe(false);
    expect(inspection.skippedSensitive).toBeGreaterThanOrEqual(9);
    expect(pack.get('audit-job.json')!.toString()).not.toContain('SECRET_VALUE');
  });

  it('sanitizes nested legacy JSON without corrupting its structure', () => {
    const input = Buffer.from(JSON.stringify({
      item: { password: 'SECRET', token: 'SECRET', session: 'SECRET', nested: { text: 'https://example.test/page?foo=SECRET_VALUE#private' } },
      responsive: { width: 320, candidate: true }, list: [1, { cookie: 'SECRET' }],
    }));
    const output = sanitizeExternalArtifact('defects.json', input);
    const result = JSON.parse(output.toString()) as Record<string, any>;
    expect(result.responsive).toEqual({ width: 320, candidate: true });
    expect(result.item.password).toBe('[REDACTED]');
    expect(result.item.nested.text).toBe('https://example.test/page');
    expect(output.toString()).not.toMatch(/SECRET_VALUE|"SECRET"/);
  });

  it('keeps a legitimate 13 MiB screenshot in local evidence export', async () => {
    const { root, project, report } = await setup();
    const screenshot = crypto.randomBytes(13 * 1024 * 1024);
    await fs.writeFile(path.join(report, 'gpt-evidence.zip'), storedZip([
      { name: 'defects.json', content: Buffer.from('[]') },
      { name: 'screenshots/mobile.png', content: screenshot },
    ]));
    const job: AuditJob = {
      id: 'done', url: 'https://example.test/', preset: 'QUICK', status: 'ISSUE',
      createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      reportUrl: '/reports/done/report.html', configuration: { mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'QUICK' },
    };
    const outer = readZipEntries((await buildChatGptFixPack(root, project, report, job)).buffer,
      { maxEntryBytes: 48 * 1024 * 1024, maxUncompressedBytes: 60 * 1024 * 1024 });
    const inner = readZipEntries(outer.get('audit/gpt-evidence.zip')!, { maxEntryBytes: 48 * 1024 * 1024, maxUncompressedBytes: 60 * 1024 * 1024 });
    expect(digest(inner.get('screenshots/mobile.png')!)).toBe(digest(screenshot));
  });

  it('requires completed evidence and binds a returned package to the original project path', async () => {
    const { root, project, report } = await setup();
    const unfinished = { id: 'running', url: 'https://example.test', preset: 'QUICK', status: 'RUNNING',
      createdAt: new Date().toISOString(), configuration: { mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'QUICK' } } as AuditJob;
    await expect(buildChatGptFixPack(root, project, report, unfinished)).rejects.toThrow(/завершённый аудит/);
    const original = await fs.readFile(path.join(project, 'src', 'first.ts'));
    const zip = await packageFor(root, project, [{ id: 'F001', action: 'replace', path: 'src/first.ts', before: original, content: Buffer.from('export const first = 2;\n') }]);
    const copy = path.join(root, 'copied-project');
    await fs.cp(project, copy, { recursive: true });
    await expect(applyFixPackage(root, copy, zip)).rejects.toThrow(/SOURCE_PROJECT_MISMATCH/);
    expect(await fs.readFile(path.join(copy, 'src', 'first.ts'))).toEqual(original);
  });

  it('rejects case-only ZIP collisions and central/local flag or method contradictions', () => {
    const standard = storedZip([{ name: 'files/F001.txt', content: Buffer.from('abc') }, { name: 'files/f001.txt', content: Buffer.from('xyz') }]);
    expect(() => readZipEntries(standard)).toThrow(/duplicate/i);
    const base = storedZip([{ name: 'files/F001.txt', content: Buffer.from('abc') }]);
    const central = base.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(central).toBeGreaterThan(0);
    const flags = Buffer.from(base);
    flags.writeUInt16LE(0x0800, central + 8);
    expect(() => readZipEntries(flags)).toThrow(/flags|mismatch/i);
    const method = Buffer.from(base);
    method.writeUInt16LE(8, central + 10);
    expect(() => readZipEntries(method)).toThrow(/method|mismatch/i);
  });

  it('rejects binary and oversized replacements before mutation', async () => {
    const { root, project } = await setup();
    const target = path.join(project, 'src', 'first.ts');
    const original = await fs.readFile(target);
    for (const content of [Buffer.from([0, 1, 2]), Buffer.alloc(769 * 1024, 65)]) {
      const zip = await packageFor(root, project, [{ id: 'F001', action: 'replace', path: 'src/first.ts', before: original, content }]);
      await expect(applyFixPackage(root, project, zip)).rejects.toThrow(/REPLACE_NOT_ALLOWED/);
      expect(await fs.readFile(target)).toEqual(original);
    }
  });

  it('preserves a concurrent third-party edit at the apply commit point', async () => {
    const { root, project } = await setup();
    const target = path.join(project, 'src', 'first.ts');
    const before = await fs.readFile(target);
    const external = 'export const first = 999;\n';
    const zip = await packageFor(root, project, [{ id: 'F001', action: 'replace', path: 'src/first.ts', before, content: Buffer.from('export const first = 2;\n') }]);
    const rename = fs.rename.bind(fs);
    let injected = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (!injected && String(from) === target && String(to).includes('.vqb-old-')) {
        injected = true;
        await fs.writeFile(target, external);
      }
      return rename(from, to);
    });
    await expect(applyFixPackage(root, project, zip)).rejects.toThrow(/EMERGENCY_ROLLBACK_INCOMPLETE/);
    expect(injected).toBe(true);
    expect(await fs.readFile(target, 'utf8')).toBe(external);
  });

  it('preserves a concurrent edit during persistent rollback', async () => {
    const { root, project } = await setup();
    const target = path.join(project, 'src', 'first.ts');
    const before = await fs.readFile(target);
    const after = Buffer.from('export const first = 2;\n');
    const zip = await packageFor(root, project, [{ id: 'F001', action: 'replace', path: 'src/first.ts', before, content: after }]);
    const applied = await applyFixPackage(root, project, zip);
    const rename = fs.rename.bind(fs);
    let injected = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (!injected && String(from) === target && String(to).includes('.vqb-old-')) {
        injected = true;
        await fs.writeFile(target, 'export const first = 999;\n');
      }
      return rename(from, to);
    });
    await expect(rollbackFix(root, project, applied.backupId)).rejects.toThrow(/CONCURRENT_MODIFICATION/);
    expect(injected).toBe(true);
    expect(await fs.readFile(target, 'utf8')).toBe('export const first = 999;\n');
  });

  it('keeps an external edit after the first operation when a later operation fails', async () => {
    const { root, project } = await setup();
    const first = path.join(project, 'src', 'first.ts');
    const second = path.join(project, 'src', 'second.ts');
    const firstBefore = await fs.readFile(first);
    const secondBefore = await fs.readFile(second);
    const zip = await packageFor(root, project, [
      { id: 'F001', action: 'replace', path: 'src/first.ts', before: firstBefore, content: Buffer.from('export const first = 2;\n') },
      { id: 'F002', action: 'replace', path: 'src/second.ts', before: secondBefore, content: Buffer.from('export const second = 2;\n') },
    ]);
    const link = fs.link.bind(fs);
    let injected = false;
    vi.spyOn(fs, 'link').mockImplementation(async (existing, target) => {
      if (String(target) === second) throw Object.assign(new Error('simulated Windows file lock'), { code: 'EPERM' });
      await link(existing, target);
      if (!injected && String(target) === first) {
        injected = true;
        await fs.writeFile(first, 'export const first = 999;\n');
      }
    });
    await expect(applyFixPackage(root, project, zip)).rejects.toThrow(/EMERGENCY_ROLLBACK_INCOMPLETE/);
    expect(injected).toBe(true);
    expect(await fs.readFile(first, 'utf8')).toBe('export const first = 999;\n');
    expect(await fs.readFile(second)).toEqual(secondBefore);
  });

  it('rejects a symlink introduced during recursive parent creation without touching outside', async () => {
    if (process.platform === 'win32') return;
    const { root, project } = await setup();
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside);
    const content = Buffer.from('export const escaped = false;\n');
    const zip = await packageFor(root, project, [{ id: 'F001', action: 'create', path: 'new/deep/escape.ts', content }]);
    const mkdir = fs.mkdir.bind(fs);
    let injected = false;
    vi.spyOn(fs, 'mkdir').mockImplementation(async (dir, options) => {
      const result = await mkdir(dir, options);
      if (!injected && String(dir) === path.join(project, 'new')) {
        injected = true;
        await fs.rmdir(String(dir));
        await fs.symlink(outside, String(dir));
      }
      return result;
    });
    await expect(applyFixPackage(root, project, zip)).rejects.toThrow(/FILESYSTEM_ESCAPE|Symlink|EMERGENCY_ROLLBACK_INCOMPLETE/);
    expect(injected).toBe(true);
    await expect(fs.stat(path.join(outside, 'deep', 'escape.ts'))).rejects.toThrow();
  });

  it('reports post-commit cleanup failure as warning and retains a usable backup', async () => {
    const { root, project } = await setup();
    const target = path.join(project, 'src', 'first.ts');
    const before = await fs.readFile(target);
    const after = Buffer.from('export const first = 2;\n');
    const zip = await packageFor(root, project, [{ id: 'F001', action: 'replace', path: 'src/first.ts', before, content: after }]);
    const rm = fs.rm.bind(fs);
    vi.spyOn(fs, 'rm').mockImplementation(async (targetPath, options) => {
      if (String(targetPath).includes('.vqb-old-')) throw Object.assign(new Error('locked'), { code: 'EPERM' });
      return rm(targetPath, options);
    });
    const applied = await applyFixPackage(root, project, zip);
    expect(applied.warnings.join(' ')).toContain('old-копию');
    expect(await fs.readFile(target)).toEqual(after);
    vi.restoreAllMocks();
    await rollbackFix(root, project, applied.backupId);
    expect(await fs.readFile(target)).toEqual(before);
  });

  it('refuses a tampered backup manifest even if its plain SHA sidecar was updated', async () => {
    const { root, project } = await setup();
    const target = path.join(project, 'src', 'first.ts');
    const before = await fs.readFile(target);
    const after = Buffer.from('export const first = 2;\n');
    const zip = await packageFor(root, project, [{ id: 'F001', action: 'replace', path: 'src/first.ts', before, content: after }]);
    const applied = await applyFixPackage(root, project, zip);
    const dir = path.join(root, 'fix-backups', applied.backupId);
    const manifest = path.join(dir, 'backup-manifest.json');
    const modified = Buffer.from((await fs.readFile(manifest, 'utf8')).replace('src/first.ts', 'src/other.ts'));
    await fs.writeFile(manifest, modified);
    await fs.writeFile(path.join(dir, 'backup-manifest.sha256'), `${digest(modified)}  backup-manifest.json\n${'0'.repeat(64)}  installation-seal\n`);
    await expect(rollbackFix(root, project, applied.backupId)).rejects.toThrow(/BACKUP_CORRUPT/);
    expect(await fs.readFile(target)).toEqual(after);
  });
});
