import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectAuditMetadata } from '../audit-engine/evidence/provenance';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))));

describe('source provenance', () => {
  it('changes the source-tree hash when source bytes change but ignores volatile report output', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-provenance-'));
    roots.push(root);
    await fs.mkdir(path.join(root, 'configs'), { recursive: true });
    await fs.mkdir(path.join(root, 'reports'), { recursive: true });
    await fs.writeFile(path.join(root, 'source.txt'), 'alpha');
    await fs.writeFile(path.join(root, 'configs', 'audit.json'), '{"v":1}');
    const first = await collectAuditMetadata(root, 'test-browser');
    await fs.writeFile(path.join(root, 'reports', 'volatile.txt'), 'ignored');
    await fs.writeFile(path.join(root, 'final-verification.log'), 'volatile log');
    await fs.writeFile(path.join(root, 'PACKAGE_MANIFEST.sha256'), 'derived manifest');
    await fs.mkdir(path.join(root, 'app', 'frontend', '.vite-build'), { recursive: true });
    await fs.writeFile(path.join(root, 'app', 'frontend', '.vite-build', 'index.html'), 'generated build');
    await fs.mkdir(path.join(root, 'app', 'frontend', '.vite-build-stage-test'), { recursive: true });
    await fs.writeFile(path.join(root, 'app', 'frontend', '.vite-build-stage-test', 'partial.js'), 'generated partial build');
    const second = await collectAuditMetadata(root, 'test-browser');
    expect(second.sourceTreeHash).toBe(first.sourceTreeHash);
    await fs.writeFile(path.join(root, 'source.txt'), 'beta');
    const third = await collectAuditMetadata(root, 'test-browser');
    expect(third.sourceTreeHash).not.toBe(first.sourceTreeHash);
    expect(third.configHash).toBe(first.configHash);
  });
});
