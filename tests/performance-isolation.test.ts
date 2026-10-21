import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPerformanceAudit } from '../audit-engine/performance/lighthouse';

const roots: string[] = [];
let previousWorker: string | undefined;
let previousNodeEnv: string | undefined;

beforeEach(() => {
  previousWorker = process.env.VQB_LIGHTHOUSE_WORKER_ENTRY;
  previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.VQB_LIGHTHOUSE_WORKER_ENTRY = path.resolve('tests/fixtures/lighthouse-isolate-worker.mjs');
});

afterEach(async () => {
  if (previousWorker === undefined) delete process.env.VQB_LIGHTHOUSE_WORKER_ENTRY;
  else process.env.VQB_LIGHTHOUSE_WORKER_ENTRY = previousWorker;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function outputDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-isolate-'));
  roots.push(dir);
  return dir;
}

describe('Lighthouse process isolation', () => {
  it('keeps parent cancellation responsive and reaps a hard-wedged worker', async () => {
    const controller = new AbortController();
    const dir = await outputDir();
    const audit = runPerformanceAudit({ url: 'https://example.com/hang', outputDir: dir, signal: controller.signal });
    const pidPath = path.join(dir, 'fixture-worker.pid');
    await vi.waitFor(async () => { expect(await fs.readFile(pidPath, 'utf8')).toMatch(/^\d+$/); });
    const workerPid = Number(await fs.readFile(pidPath, 'utf8'));
    const cancelStarted = Date.now();
    controller.abort(new Error('fixture-user-cancel'));
    await expect(audit).rejects.toThrow('fixture-user-cancel');
    expect(Date.now() - cancelStarted).toBeLessThan(5_000);
    const alive = () => { try { process.kill(workerPid, 0); return true; } catch { return false; } };
    await vi.waitFor(() => { expect(alive()).toBe(false); }, { timeout: 4_000, interval: 100 });
  });

  it('relays progress and result messages from the isolated worker', async () => {
    const progress: number[] = [];
    const completed: number[] = [];
    const result = await runPerformanceAudit({
      url: 'https://example.com/success', outputDir: await outputDir(),
      onRunProgress: (snapshot) => { progress.push(snapshot.run); },
      onRunComplete: (run) => { completed.push(run); },
    });
    expect(progress).toEqual([1]);
    expect(completed).toEqual([1]);
    expect(result.methodology).toBe('TEST_ISOLATE');
  });
});
