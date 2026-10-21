import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const scripts = ['package-files.mjs', 'create-package-provenance.mjs', 'verify-package-integrity.mjs'];

async function sha256(file: string): Promise<string> {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

async function createFixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-package-integrity-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'scripts'), { recursive: true });
  for (const script of scripts) {
    await fs.copyFile(path.resolve('scripts', script), path.join(root, 'scripts', script));
  }
  await fs.writeFile(path.join(root, 'source.txt'), 'alpha\n');
  await execFileAsync(process.execPath, ['scripts/create-package-provenance.mjs'], { cwd: root });
  const manifestFiles = [
    'source.txt',
    ...scripts.map((name) => `scripts/${name}`),
    'PACKAGE_PROVENANCE.json',
  ].sort();
  const lines = await Promise.all(manifestFiles.map(async (relative) => `${await sha256(path.join(root, relative))}  ${relative}`));
  await fs.writeFile(path.join(root, 'PACKAGE_MANIFEST.sha256'), `${lines.join('\n')}\n`);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

describe('release package integrity', () => {
  it('accepts the exact tracked release set', async () => {
    const root = await createFixture();
    const { stdout } = await execFileAsync(process.execPath, ['scripts/verify-package-integrity.mjs'], { cwd: root });
    expect(stdout).toContain('PACKAGE_INTEGRITY PASS');
  });

  it('rejects an unexpected file that is absent from manifest and provenance', async () => {
    const root = await createFixture();
    await fs.writeFile(path.join(root, 'unexpected.mjs'), 'export default 1;\n');
    await expect(execFileAsync(process.execPath, ['scripts/verify-package-integrity.mjs'], { cwd: root })).rejects.toMatchObject({
      stderr: expect.stringContaining('file set mismatch'),
    });
  });
});
