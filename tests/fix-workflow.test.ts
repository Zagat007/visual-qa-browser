import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFixPackage, buildChatGptFixPack, inspectWorkspace, listFixBackups, readZipEntries, rollbackFix } from '../app/backend/src/fix-workflow';
import { signWorkspaceSnapshot } from '../audit-engine/privacy/secret-store';
import { storedZip } from '../audit-engine/reporting/zip';
import type { AuditJob } from '../audit-engine/shared/types';

const roots: string[] = [];
const hash = (value: Buffer | string): string => crypto.createHash('sha256').update(value).digest('hex');

async function fixture(): Promise<{ root: string; project: string; report: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-fix-'));
  roots.push(root);
  const project = path.join(root, 'project');
  const report = path.join(root, 'reports', 'example', 'audit');
  await fs.mkdir(path.join(project, 'src'), { recursive: true });
  await fs.mkdir(path.join(project, 'node_modules', 'ignored'), { recursive: true });
  await fs.mkdir(report, { recursive: true });
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'fixture', scripts: {} }, null, 2));
  await fs.writeFile(path.join(project, 'src', 'app.ts'), 'export const value = "old";\n');
  await fs.writeFile(path.join(project, '.env'), 'SECRET=do-not-export\n');
  await fs.writeFile(path.join(project, 'credentials.json'), JSON.stringify({ username: 'admin', password: 'super-secret-password', databaseUrl: 'postgres://user:pass1234@localhost/db' }));
  await fs.writeFile(path.join(project, 'config.json'), JSON.stringify({ database_url: 'postgres://user:pass5678@localhost/db' }));
  await fs.writeFile(path.join(project, 'src', 'runtime.ts'), 'export const password = "super-secret-password";\n');
  await fs.writeFile(path.join(project, 'node_modules', 'ignored', 'index.js'), 'secret dependency');
  await fs.writeFile(path.join(report, 'gpt-evidence.zip'), storedZip([
    { name: 'defects.json', content: Buffer.from(JSON.stringify([{ page: 'https://example.com/path?unknown=secret-value#frag', token: 'nested-secret' }])) },
    { name: 'README.txt', content: Buffer.from('Target https://example.com/path?foo=bar#frag') },
  ]));
  await fs.writeFile(path.join(report, 'gpt-fix-prompt.txt'), 'fix prompt');
  await fs.writeFile(path.join(report, 'defects.json'), '[]\n');
  return { root, project, report };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('ChatGPT Fix Bridge', () => {
  it('exports a source-aware pack while excluding secrets and dependencies', async () => {
    const { project, report } = await fixture();
    const inspection = await inspectWorkspace(project);
    expect(inspection.fileCount).toBe(2);
    expect(inspection.skippedSensitive).toBeGreaterThanOrEqual(4);

    const job: AuditJob = {
      id: 'job-fixture', url: 'https://example.com/private?unknown=secret-value&token=known-secret#frag', preset: 'QUICK', status: 'ISSUE', createdAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
      configuration: { mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'QUICK' },
      reportUrl: '/reports/example/audit/report.html',
    };
    const pack = await buildChatGptFixPack(path.dirname(project), project, report, job);
    const entries = readZipEntries(pack.buffer);
    expect(entries.has('README_FOR_CHATGPT.txt')).toBe(true);
    expect(entries.has('audit/gpt-evidence.zip')).toBe(true);
    expect(entries.has('RETURN_FIX_PACKAGE_SPEC.json')).toBe(true);
    const manifest = JSON.parse(entries.get('workspace-manifest.json')!.toString()) as { files: Array<{ path: string; archiveEntry: string; sha256: string }> };
    expect(manifest.files.map((file) => file.path)).toEqual(['package.json', 'src/app.ts']);
    expect(manifest.files.some((file) => file.path.includes('.env'))).toBe(false);
    expect(manifest.files.some((file) => file.path.includes('node_modules'))).toBe(false);
    expect(manifest.files.some((file) => file.path.includes('credentials.json'))).toBe(false);
    expect(manifest.files.some((file) => file.path.includes('config.json'))).toBe(false);
    const app = manifest.files.find((file) => file.path === 'src/app.ts')!;
    expect(hash(entries.get(app.archiveEntry)!)).toBe(app.sha256);
    const externalJob = JSON.parse(entries.get('audit-job.json')!.toString()) as { url: string };
    expect(externalJob.url).toBe('https://example.com/private');
    const evidence = readZipEntries(entries.get('audit/gpt-evidence.zip')!);
    expect(evidence.get('README.txt')?.toString()).toContain('https://example.com/path');
    expect(evidence.get('README.txt')?.toString()).not.toContain('foo=bar');
    const evidenceJson = JSON.parse(evidence.get('defects.json')!.toString()) as Array<{ page: string; token: string }>;
    expect(evidenceJson[0]?.page).toBe('https://example.com/path');
    expect(evidenceJson[0]?.token).toBe('[REDACTED]');
  });

  it('applies hash-locked replace/create operations, verifies, and rolls back', async () => {
    const { root, project } = await fixture();
    const target = path.join(project, 'src', 'app.ts');
    const before = await fs.readFile(target);
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const replacement = Buffer.from('export const value = "new";\n');
    const created = Buffer.from('export const created = true;\n');
    const fixZip = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({
        schemaVersion: 2, fixId: 'fixture-fix', summary: 'Two minimal changes.', sourcePackFingerprint, sourcePackBinding, operations: [
          { id: 'F001', action: 'replace', path: 'src/app.ts', archiveEntry: 'files/F001.txt', beforeSha256: hash(before), afterSha256: hash(replacement) },
          { id: 'F002', action: 'create', path: 'src/created.ts', archiveEntry: 'files/F002.txt', afterSha256: hash(created) },
        ],
      })) },
      { name: 'files/F001.txt', content: replacement },
      { name: 'files/F002.txt', content: created },
    ]);

    const applied = await applyFixPackage(root, project, fixZip);
    expect(await fs.readFile(target, 'utf8')).toContain('"new"');
    expect(await fs.readFile(path.join(project, 'src', 'created.ts'), 'utf8')).toContain('created = true');
    expect(applied.verification.status).toBe('NOT_VERIFIED');
    expect(applied.appliedFiles).toEqual(['src/app.ts', 'src/created.ts']);

    const rolledBack = await rollbackFix(root, project, applied.backupId);
    expect(rolledBack.restoredFiles).toEqual(['src/app.ts', 'src/created.ts']);
    expect(await fs.readFile(target, 'utf8')).toBe(before.toString());
    await expect(fs.stat(path.join(project, 'src', 'created.ts'))).rejects.toThrow();
  });

  it('refuses stale, traversal, and sensitive-path packages before writing', async () => {
    const { root, project } = await fixture();
    const target = path.join(project, 'src', 'app.ts');
    const original = await fs.readFile(target, 'utf8');
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const replacement = Buffer.from('changed\n');
    const makeZip = (operation: Record<string, unknown>) => storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'blocked-fix', summary: 'blocked', sourcePackFingerprint, sourcePackBinding, operations: [operation] })) },
      { name: 'files/F001.txt', content: replacement },
    ]);

    await expect(applyFixPackage(root, project, makeZip({ id: 'F001', action: 'replace', path: 'src/app.ts', archiveEntry: 'files/F001.txt', beforeSha256: hash('stale'), afterSha256: hash(replacement) }))).rejects.toThrow(/SOURCE_MANIFEST_MISMATCH|STALE_SOURCE/);
    await expect(applyFixPackage(root, project, makeZip({ id: 'F001', action: 'create', path: '../escape.ts', archiveEntry: 'files/F001.txt', afterSha256: hash(replacement) }))).rejects.toThrow(/fix-manifest|Unsafe relative path/);
    await expect(applyFixPackage(root, project, makeZip({ id: 'F001', action: 'replace', path: '.env', archiveEntry: 'files/F001.txt', beforeSha256: hash('SECRET=do-not-export\n'), afterSha256: hash(replacement) }))).rejects.toThrow(/защищённый путь/);
    await expect(applyFixPackage(root, project, makeZip({ id: 'F001', action: 'replace', path: 'src/runtime.ts', archiveEntry: 'files/F001.txt', beforeSha256: hash('export const password = "super-secret-password";\n'), afterSha256: hash(replacement) }))).rejects.toThrow(/TARGET_NOT_EXPORTED/);
    await expect(applyFixPackage(root, project, makeZip({ id: 'F001', action: 'create', path: 'assets/payload.exe', archiveEntry: 'files/F001.txt', afterSha256: hash(replacement) }))).rejects.toThrow(/CREATE_NOT_ALLOWED/);
    expect(await fs.readFile(target, 'utf8')).toBe(original);
  });

  it('accepts empty directory entries and rejects ZIP64 sentinels', () => {
    const normal = storedZip([
      { name: 'files/', content: Buffer.alloc(0) },
      { name: 'fix-manifest.json', content: Buffer.from('{}') },
      { name: 'files/F001.txt', content: Buffer.from('abc') },
    ]);
    const entries = readZipEntries(normal);
    expect(entries.has('files')).toBe(false);
    expect(entries.get('files/F001.txt')?.toString()).toBe('abc');

    const zip64 = Buffer.from(normal);
    let eocd = -1;
    for (let offset = zip64.length - 22; offset >= 0; offset -= 1) {
      if (zip64.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
    }
    expect(eocd).toBeGreaterThanOrEqual(0);
    zip64.writeUInt32LE(0xffffffff, eocd + 16);
    expect(() => readZipEntries(zip64)).toThrow(/ZIP64/);
  });

  it('rejects duplicate operation ids and Windows-unsafe target names', async () => {
    const { root, project } = await fixture();
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const one = Buffer.from('one\n');
    const two = Buffer.from('two\n');
    const duplicateIds = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'duplicate-id', summary: 'blocked', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'create', path: 'src/one.ts', archiveEntry: 'files/F001.txt', afterSha256: hash(one) },
        { id: 'F001', action: 'create', path: 'src/two.ts', archiveEntry: 'files/F002.txt', afterSha256: hash(two) },
      ] })) },
      { name: 'files/F001.txt', content: one },
      { name: 'files/F002.txt', content: two },
    ]);
    await expect(applyFixPackage(root, project, duplicateIds)).rejects.toThrow(/duplicate id/);

    const caseOnlyIds = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'case-id', summary: 'blocked', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'create', path: 'src/one.ts', archiveEntry: 'files/F001.txt', afterSha256: hash(one) },
        { id: 'f001', action: 'create', path: 'src/two.ts', archiveEntry: 'files/F002.txt', afterSha256: hash(two) },
      ] })) },
      { name: 'files/F001.txt', content: one },
      { name: 'files/F002.txt', content: two },
    ]);
    await expect(applyFixPackage(root, project, caseOnlyIds)).rejects.toThrow(/duplicate id/);

    const reservedId = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'reserved-id', summary: 'blocked', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'CON', action: 'create', path: 'src/ok.ts', archiveEntry: 'files/F001.txt', afterSha256: hash(one) },
      ] })) },
      { name: 'files/F001.txt', content: one },
    ]);
    await expect(applyFixPackage(root, project, reservedId)).rejects.toThrow(/invalid id/);

    const unsafeName = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'unsafe-name', summary: 'blocked', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'create', path: 'src/CON.txt', archiveEntry: 'files/F001.txt', afterSha256: hash(one) },
      ] })) },
      { name: 'files/F001.txt', content: one },
    ]);
    await expect(applyFixPackage(root, project, unsafeName)).rejects.toThrow(/Windows-unsafe/);
  });

  it('rejects a target routed through a symlinked project directory', async () => {
    if (process.platform === 'win32') return;
    const { root, project } = await fixture();
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside, { recursive: true });
    await fs.symlink(outside, path.join(project, 'linked'));
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const content = Buffer.from('escape blocked\n');
    const packageWithSymlinkTarget = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'symlink-block', summary: 'blocked', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'create', path: 'linked/escape.ts', archiveEntry: 'files/F001.txt', afterSha256: hash(content) },
      ] })) },
      { name: 'files/F001.txt', content },
    ]);
    await expect(applyFixPackage(root, project, packageWithSymlinkTarget)).rejects.toThrow(/Symlink path is not allowed/);
    await expect(fs.stat(path.join(outside, 'escape.ts'))).rejects.toThrow();
  });

  it('never executes project scripts automatically, even when existing scripts have external side effects', async () => {
    const { root, project } = await fixture();
    const outside = path.join(root, 'outside-side-effect.txt');
    await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({
      name: 'fixture',
      scripts: { test: `node -e "require('fs').writeFileSync(${JSON.stringify(outside)},'must-not-exist')"` },
    }, null, 2));
    const target = path.join(project, 'src', 'app.ts');
    const before = await fs.readFile(target);
    const replacement = Buffer.from('export const value = "verified-without-exec";\n');
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const fixZip = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'no-script-exec', summary: 'safe precheck', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'replace', path: 'src/app.ts', archiveEntry: 'files/F001.txt', beforeSha256: hash(before), afterSha256: hash(replacement) },
      ] })) },
      { name: 'files/F001.txt', content: replacement },
    ]);

    const applied = await applyFixPackage(root, project, fixZip);
    expect(applied.verification.status).toBe('NOT_VERIFIED');
    expect(applied.verification.note).toMatch(/project scripts/i);
    expect(await fs.readFile(target, 'utf8')).toContain('verified-without-exec');
    await expect(fs.stat(outside)).rejects.toThrow();
    await rollbackFix(root, project, applied.backupId);
  });

  it('blocks project mutation when non-executing structural precheck fails', async () => {
    const { root, project } = await fixture();
    const packagePath = path.join(project, 'package.json');
    const before = await fs.readFile(packagePath);
    const replacement = Buffer.from('{ invalid json');
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const fixZip = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'failed-precheck', summary: 'invalid json must block', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'replace', path: 'package.json', archiveEntry: 'files/F001.txt', beforeSha256: hash(before), afterSha256: hash(replacement) },
      ] })) },
      { name: 'files/F001.txt', content: replacement },
    ]);

    await expect(applyFixPackage(root, project, fixZip)).rejects.toThrow(/PRECHECK_FAILED/);
    expect(await fs.readFile(packagePath, 'utf8')).toBe(before.toString());
    const backups = await listFixBackups(root, project);
    expect(backups.backups).toHaveLength(0);
  });

  it('never auto-executes scripts when package metadata is changed by the Fix Package', async () => {
    const { root, project } = await fixture();
    const packagePath = path.join(project, 'package.json');
    const before = await fs.readFile(packagePath);
    const replacement = Buffer.from(JSON.stringify({ name: 'fixture', scripts: { test: 'node -e "require(\'fs\').writeFileSync(\'must-not-run.txt\',\'owned\')"' } }, null, 2));
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const fixZip = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'package-change', summary: 'package change', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'replace', path: 'package.json', archiveEntry: 'files/F001.txt', beforeSha256: hash(before), afterSha256: hash(replacement) },
      ] })) },
      { name: 'files/F001.txt', content: replacement },
    ]);

    const applied = await applyFixPackage(root, project, fixZip);
    expect(applied.verification.status).toBe('NOT_VERIFIED');
    expect(applied.verification.note).toMatch(/project scripts/i);
    await expect(fs.stat(path.join(project, 'must-not-run.txt'))).rejects.toThrow();
    await rollbackFix(root, project, applied.backupId);
  });

  it('verifies backup payload hashes and rejects corrupted backups before rollback writes', async () => {
    const { root, project } = await fixture();
    const target = path.join(project, 'src', 'app.ts');
    const before = await fs.readFile(target);
    const replacement = Buffer.from('export const value = "new";\n');
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const fixZip = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'backup-integrity', summary: 'backup hash', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'replace', path: 'src/app.ts', archiveEntry: 'files/F001.txt', beforeSha256: hash(before), afterSha256: hash(replacement) },
      ] })) },
      { name: 'files/F001.txt', content: replacement },
    ]);
    const applied = await applyFixPackage(root, project, fixZip);
    await fs.writeFile(path.join(root, 'fix-backups', applied.backupId, 'files', 'F001.bin'), 'corrupted backup');
    await expect(rollbackFix(root, project, applied.backupId)).rejects.toThrow(/BACKUP_CORRUPT/);
    expect(await fs.readFile(target, 'utf8')).toContain('"new"');
  });

  it('persists rollback discovery across UI/process restarts and marks completed rollback', async () => {
    const { root, project } = await fixture();
    const target = path.join(project, 'src', 'app.ts');
    const before = await fs.readFile(target);
    const replacement = Buffer.from('export const value = "persistent";\n');
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const fixZip = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'persistent-backup', summary: 'persistent backup', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'replace', path: 'src/app.ts', archiveEntry: 'files/F001.txt', beforeSha256: hash(before), afterSha256: hash(replacement) },
      ] })) },
      { name: 'files/F001.txt', content: replacement },
    ]);
    const applied = await applyFixPackage(root, project, fixZip);
    const beforeRestart = await listFixBackups(root, project);
    expect(beforeRestart.backups.some((item) => item.backupId === applied.backupId && !item.rolledBackAt)).toBe(true);
    await rollbackFix(root, project, applied.backupId);
    const afterRollback = await listFixBackups(root, project);
    expect(afterRollback.backups.find((item) => item.backupId === applied.backupId)?.rolledBackAt).toBeTruthy();
  });

  it('removes only directories created by a create operation during rollback', async () => {
    const { root, project } = await fixture();
    const content = Buffer.from('export const nested = true;\n');
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const fixZip = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'nested-create', summary: 'nested create', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'create', path: 'generated/deep/file.ts', archiveEntry: 'files/F001.txt', afterSha256: hash(content) },
      ] })) },
      { name: 'files/F001.txt', content },
    ]);
    const applied = await applyFixPackage(root, project, fixZip);
    expect(await fs.readFile(path.join(project, 'generated', 'deep', 'file.ts'), 'utf8')).toContain('nested');
    await rollbackFix(root, project, applied.backupId);
    await expect(fs.stat(path.join(project, 'generated'))).rejects.toThrow();
  });

  it('supports resumable rollback when part of the project is already restored', async () => {
    const { root, project } = await fixture();
    const target = path.join(project, 'src', 'app.ts');
    const before = await fs.readFile(target);
    const replacement = Buffer.from('export const value = "partially-restored";\n');
    const created = Buffer.from('export const created = true;\n');
    const sourcePackFingerprint = (await inspectWorkspace(project)).fingerprint;
    const sourcePackBinding = await signWorkspaceSnapshot(root, project, sourcePackFingerprint);
    const fixZip = storedZip([
      { name: 'fix-manifest.json', content: Buffer.from(JSON.stringify({ schemaVersion: 2, fixId: 'resume-rollback', summary: 'resume rollback', sourcePackFingerprint, sourcePackBinding, operations: [
        { id: 'F001', action: 'replace', path: 'src/app.ts', archiveEntry: 'files/F001.txt', beforeSha256: hash(before), afterSha256: hash(replacement) },
        { id: 'F002', action: 'create', path: 'src/created.ts', archiveEntry: 'files/F002.txt', afterSha256: hash(created) },
      ] })) },
      { name: 'files/F001.txt', content: replacement },
      { name: 'files/F002.txt', content: created },
    ]);
    const applied = await applyFixPackage(root, project, fixZip);
    await fs.writeFile(target, before);
    const rolledBack = await rollbackFix(root, project, applied.backupId);
    expect(rolledBack.restoredFiles).toEqual(['src/app.ts', 'src/created.ts']);
    await expect(fs.stat(path.join(project, 'src', 'created.ts'))).rejects.toThrow();
  });



});
