import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JobManager } from '../app/backend/src/job-manager';
import { encryptCheckpointSecret } from '../audit-engine/privacy/secret-store';
import type { AuditConfiguration, AuditJob, AuditResult } from '../audit-engine/shared/types';
import type { RunAuditOptions } from '../audit-engine/orchestrator/run-audit';

const roots: string[] = [];
const managers: JobManager[] = [];
afterEach(async () => {
  // Snapshot and clear module-global fixtures first so one failed cleanup cannot
  // poison every later test in this file on slower Windows filesystems.
  const currentManagers = managers.splice(0);
  const currentRoots = roots.splice(0);
  let cleanupError: unknown;
  try {
    await waitFor(() => currentManagers.every((manager) => {
      const diagnostics = manager.diagnostics();
      return diagnostics.activeCount === 0 && diagnostics.queueLength === 0 && diagnostics.controllerIds.length === 0;
    }), 5_000);
  } catch (error) {
    cleanupError = error;
  } finally {
    await Promise.all(currentRoots.map((root) => fs.rm(root, { recursive: true, force: true })));
  }
  if (cleanupError) throw cleanupError;
});

function createManager(...args: ConstructorParameters<typeof JobManager>): JobManager {
  const manager = new JobManager(...args);
  managers.push(manager);
  return manager;
}

async function root(): Promise<string> {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-jobs-'));
  roots.push(value);
  return value;
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for job state.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const QUICK_FULL: AuditConfiguration = { mode: 'FULL', modules: ['VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'RUNTIME', 'ACCESSIBILITY', 'SEO', 'SECURITY'], viewportPreset: 'QUICK' };

function result(jobId: string, configuration: AuditConfiguration, url: string): AuditResult {
  const now = new Date().toISOString();
  return {
    jobId,
    requestedUrl: url,
    preset: configuration.viewportPreset,
    configuration,
    startedAt: now,
    finishedAt: now,
    status: 'PASS',
    safeMode: true,
    metadata: {
      appVersion: '1.1.9', sourceTreeHash: 'source', sourceFileCount: 1, configHash: 'config', packageLockHash: 'lock',
      gitCommit: 'commit', gitDirty: false, browserVersion: 'test', nodeVersion: process.versions.node,
      os: { platform: process.platform, release: 'test', arch: process.arch },
    },
    coverage: {
      fullPassEligible: true, incompleteReasons: [], truncatedEvidenceSources: [], requestedViewports: 0,
      completedViewports: 0, failedViewports: 0, sectionScreenshots: 0, skippedSafelyRequests: 0,
      policyBlockedRequests: 0, validationFailedRequests: 0, responsiveSweepSamples: 0,
      interactionViewports: 0, interactionCandidates: 0, interactionsTested: 0,
      interactionsSkippedSafely: 0, formFieldsInspected: 0,
    },
    captures: [], captureFailures: [], responsiveSweep: null, responsiveSweepFailure: null,
    interactionAudits: [], interactionFailures: [], siteTechnical: null, siteTechnicalFailure: null,
    reportRelativePath: `${jobId}/report.html`, reportAbsolutePath: `/tmp/${jobId}/report.html`, notes: [],
  };
}

describe('JobManager hardening', () => {
  it('reserves capacity before asynchronous persistence for concurrent API submissions', async () => {
    const workRoot = await root();
    const runner = async ({ signal }: { signal?: AbortSignal }) => {
      await new Promise<void>((_resolve, reject) => {
        if (signal?.aborted) { reject(signal.reason); return; }
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      throw new Error('unreachable');
    };
    const manager = createManager(workRoot, runner as never);
    const submitted = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => manager.create(`https://example.com/job-${index}`, QUICK_FULL)));
    const admitted = submitted.filter((item) => item.status === 'fulfilled');
    try {
      expect(admitted).toHaveLength(8);
      expect(submitted.filter((item) => item.status === 'rejected')).toHaveLength(4);
    } finally {
      // Cancel queued jobs before the active one, so cleanup cannot start new work.
      for (const job of manager.list().filter((item) => item.status === 'QUEUED')) await manager.cancel(job.id);
      for (const job of manager.list().filter((item) => item.status === 'RUNNING')) await manager.cancel(job.id);
    }
  });

  it('runs at most one audit concurrently and never writes the secret URL to public checkpoint JSON', async () => {
    const workRoot = await root();
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const runner = async ({ jobId, configuration, url }: { jobId: string; configuration: AuditConfiguration; url: string }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return result(jobId, configuration, url);
    };
    const manager = createManager(workRoot, runner as never);
    const one = await manager.create('https://example.com/order/private-token-1', QUICK_FULL);
    const two = await manager.create('https://example.com/order/private-token-2', QUICK_FULL);
    const three = await manager.create('https://example.com/order/private-token-3', QUICK_FULL);
    await waitFor(() => active === 1);
    expect(maxActive).toBe(1);

    const publicState = await fs.readFile(path.join(workRoot, 'checkpoints', two.id, 'audit-state.json'), 'utf8');
    const encryptedState = await fs.readFile(path.join(workRoot, 'checkpoints', two.id, 'target.enc.json'), 'utf8');
    expect(publicState).not.toContain('private-token-2');
    expect(encryptedState).not.toContain('private-token-2');

    releases.shift()?.();
    await waitFor(() => active === 1 && manager.get(one.id)?.status === 'PASS');
    expect(maxActive).toBe(1);
    releases.shift()?.();
    await waitFor(() => active === 1 && manager.get(two.id)?.status === 'PASS');
    releases.shift()?.();
    await waitFor(() => manager.get(three.id)?.status === 'PASS');
    expect(maxActive).toBe(1);
  });

  it('isolates a failed audit, redacts its error and continues the queue', async () => {
    const workRoot = await root();
    let call = 0;
    const runner = async ({ jobId, configuration, url }: { jobId: string; configuration: AuditConfiguration; url: string }) => {
      call += 1;
      if (call === 1) throw new Error('Navigation failed at https://example.com/order/failure-secret?token=query-secret');
      return result(jobId, configuration, url);
    };
    const manager = createManager(workRoot, runner as never);
    const failed = await manager.create('https://example.com/order/failure-secret', QUICK_FULL);
    const next = await manager.create('https://example.com/', QUICK_FULL);
    await waitFor(() => manager.get(failed.id)?.status === 'FAILED' && manager.get(next.id)?.status === 'PASS');
    expect(manager.get(failed.id)?.error).not.toContain('failure-secret');
    expect(manager.get(failed.id)?.error).not.toContain('query-secret');
    expect(call).toBe(2);
  });

  it('quarantines an interrupted RUNNING checkpoint instead of silently re-queuing it', async () => {
    const workRoot = await root();
    const id = '11111111-1111-4111-8111-111111111111';
    const url = 'https://example.com/order/recovery-secret';
    const checkpointDir = path.join(workRoot, 'checkpoints', id);
    await fs.mkdir(checkpointDir, { recursive: true });
    const publicJob: AuditJob = {
      id, url: 'https://example.com/order/[REDACTED]', preset: 'QUICK', configuration: QUICK_FULL, status: 'RUNNING',
      createdAt: new Date().toISOString(), currentStage: 'capture', completedCaptures: 1, totalCaptures: 2,
    };
    await fs.writeFile(path.join(checkpointDir, 'audit-state.json'), JSON.stringify(publicJob));
    await fs.writeFile(path.join(checkpointDir, 'target.enc.json'), JSON.stringify(await encryptCheckpointSecret(workRoot, url)));

    let calls = 0;
    const runner = async ({ jobId, configuration, url: target }: { jobId: string; configuration: AuditConfiguration; url: string }) => {
      calls += 1;
      return result(jobId, configuration, target);
    };
    const manager = createManager(workRoot, runner as never);
    await manager.initialize();
    expect(manager.get(id)?.status).toBe('NOT_VERIFIED');
    expect(manager.get(id)?.currentStage).toBe('recovery-interrupted');
    expect(calls).toBe(0);
    await expect(fs.stat(path.join(checkpointDir, 'target.enc.json'))).rejects.toMatchObject({ code: 'ENOENT' });

    const fresh = await manager.create('https://example.com/', QUICK_FULL);
    await waitFor(() => manager.get(fresh.id)?.status === 'PASS');
    expect(calls).toBe(1);
  });


  it('publishes weighted progress and reaches 100 only after the report-producing audit completes', async () => {
    const workRoot = await root();
    let release: (() => void) | undefined;
    const runner = async ({ jobId, configuration, url, onProgress }: {
      jobId: string;
      configuration: AuditConfiguration;
      url: string;
      onProgress?: (progress: {
        stage: string;
        completedCaptures: number;
        totalCaptures: number;
        progressPercent: number;
        completedSteps: number;
        totalSteps: number;
        remainingSteps: number;
        currentViewport?: string;
        currentSubsystem?: string;
      }) => void | Promise<void>;
    }) => {
      await onProgress?.({
        stage: 'desktop-1440:measure',
        completedCaptures: 0,
        totalCaptures: 2,
        progressPercent: 37,
        completedSteps: 7,
        totalSteps: 19,
        remainingSteps: 12,
        currentViewport: 'desktop-1440',
        currentSubsystem: 'EVIDENCE',
      });
      await new Promise<void>((resolve) => { release = resolve; });
      return result(jobId, configuration, url);
    };
    const manager = createManager(workRoot, runner as never);
    const created = await manager.create('https://example.com/', QUICK_FULL);
    await waitFor(() => manager.get(created.id)?.progressPercent === 37 && Boolean(release));
    expect(manager.get(created.id)).toMatchObject({
      status: 'RUNNING',
      progressPercent: 37,
      completedSteps: 7,
      totalSteps: 19,
      remainingSteps: 12,
      currentViewport: 'desktop-1440',
      currentSubsystem: 'EVIDENCE',
    });
    release?.();
    await waitFor(() => manager.get(created.id)?.status === 'PASS');
    expect(manager.get(created.id)).toMatchObject({ progressPercent: 100, completedSteps: 19, totalSteps: 19, remainingSteps: 0, currentSubsystem: 'REPORT' });
  });

  it('quarantines an interrupted RUNNING job even when its encrypted target is already missing', async () => {
    const workRoot = await root();
    const id = '22222222-2222-4222-8222-222222222222';
    const checkpointDir = path.join(workRoot, 'checkpoints', id);
    await fs.mkdir(checkpointDir, { recursive: true });
    const publicJob: AuditJob = {
      id, url: 'https://example.com/order/[REDACTED]', preset: 'QUICK', configuration: QUICK_FULL, status: 'RUNNING',
      createdAt: new Date().toISOString(), currentStage: 'capture', completedCaptures: 1, totalCaptures: 2,
    };
    await fs.writeFile(path.join(checkpointDir, 'audit-state.json'), JSON.stringify(publicJob));
    const manager = createManager(workRoot, (async () => { throw new Error('must not run'); }) as never);
    await manager.initialize();
    expect(manager.get(id)?.status).toBe('NOT_VERIFIED');
    expect(manager.get(id)?.currentStage).toBe('recovery-interrupted');
    expect(manager.get(id)?.error).toContain('не возобновлён автоматически');
  });

  it('restores queued jobs in original FIFO creation order instead of filesystem enumeration order', async () => {
    const workRoot = await root();
    const jobs = [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', url: 'https://example.com/first', createdAt: '2026-10-03T00:00:00.000Z' },
      { id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', url: 'https://example.com/second', createdAt: '2026-10-03T00:00:01.000Z' },
    ];
    for (const item of jobs) {
      const checkpointDir = path.join(workRoot, 'checkpoints', item.id);
      await fs.mkdir(checkpointDir, { recursive: true });
      const publicJob: AuditJob = {
        id: item.id, url: item.url, preset: 'QUICK', configuration: QUICK_FULL, status: 'QUEUED',
        createdAt: item.createdAt, currentStage: 'queued', completedCaptures: 0, totalCaptures: 0,
      };
      await fs.writeFile(path.join(checkpointDir, 'audit-state.json'), JSON.stringify(publicJob));
      await fs.writeFile(path.join(checkpointDir, 'target.enc.json'), JSON.stringify(await encryptCheckpointSecret(workRoot, item.url)));
    }
    const executionOrder: string[] = [];
    const runner = async ({ jobId, configuration, url }: { jobId: string; configuration: AuditConfiguration; url: string }) => {
      executionOrder.push(jobId);
      return result(jobId, configuration, url);
    };
    const manager = createManager(workRoot, runner as never);
    await manager.initialize();
    await waitFor(() => manager.get(jobs[0]!.id)?.status === 'PASS' && manager.get(jobs[1]!.id)?.status === 'PASS');
    expect(executionOrder).toEqual([jobs[0]!.id, jobs[1]!.id]);
  });

  it('marks a recovered QUEUED job NOT_VERIFIED when its encrypted target is unavailable and does not block fresh work', async () => {
    const workRoot = await root();
    const id = '33333333-3333-4333-8333-333333333333';
    const checkpointDir = path.join(workRoot, 'checkpoints', id);
    await fs.mkdir(checkpointDir, { recursive: true });
    const publicJob: AuditJob = {
      id, url: 'https://example.com/[REDACTED]', preset: 'QUICK', configuration: QUICK_FULL, status: 'QUEUED',
      createdAt: new Date().toISOString(), currentStage: 'queued', completedCaptures: 0, totalCaptures: 0,
    };
    await fs.writeFile(path.join(checkpointDir, 'audit-state.json'), JSON.stringify(publicJob));
    let calls = 0;
    const runner = async ({ jobId, configuration, url }: { jobId: string; configuration: AuditConfiguration; url: string }) => {
      calls += 1;
      return result(jobId, configuration, url);
    };
    const manager = createManager(workRoot, runner as never);
    await manager.initialize();
    expect(manager.get(id)?.status).toBe('NOT_VERIFIED');
    expect(manager.get(id)?.currentStage).toBe('recovery-failed');
    expect(manager.get(id)?.error).toContain('could not be resumed');
    const fresh = await manager.create('https://example.com/', QUICK_FULL);
    await waitFor(() => manager.get(fresh.id)?.status === 'PASS');
    expect(calls).toBe(1);
  });

  it('acknowledges cancellation before a slow runner finishes cleanup', async () => {
    const workRoot = await root();
    let releaseCleanup!: () => void;
    let sawAbort!: () => void;
    const abortSeen = new Promise<void>((resolve) => { sawAbort = resolve; });
    const cleanupGate = new Promise<void>((resolve) => { releaseCleanup = resolve; });
    const runner = async ({ signal }: { signal?: AbortSignal }) => {
      await new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          sawAbort();
          void cleanupGate.then(() => reject(signal?.reason));
        };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener('abort', onAbort, { once: true });
      });
      throw new Error('unreachable');
    };
    const manager = createManager(workRoot, runner as never);
    const created = await manager.create('https://example.com/', QUICK_FULL);
    await waitFor(() => manager.get(created.id)?.status === 'RUNNING');
    const acknowledged = await Promise.race([
      manager.cancel(created.id).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 250)),
    ]);
    expect(acknowledged).toBe(true);
    await abortSeen;
    expect(manager.get(created.id)).toMatchObject({ status: 'RUNNING', currentStage: 'cancelling' });
    releaseCleanup();
    await waitFor(() => manager.get(created.id)?.status === 'CANCELLED');
    expect(manager.get(created.id)?.currentStage).toBe('cancelled');
  });

  it('cancels a running audit without converting it to PASS', async () => {
    const workRoot = await root();
    const runner = async ({ signal }: { signal?: AbortSignal }) => {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) { reject(signal.reason); return; }
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
      throw new Error('unreachable');
    };
    const manager = createManager(workRoot, runner as never);
    const created = await manager.create('https://example.com/', QUICK_FULL);
    await waitFor(() => manager.get(created.id)?.status === 'RUNNING');
    await manager.cancel(created.id);
    await waitFor(() => manager.get(created.id)?.status === 'CANCELLED');
    expect(manager.get(created.id)?.currentStage).toBe('cancelled');
    expect(manager.get(created.id)?.reportUrl).toBeUndefined();
  });

  it('ignores late progress from a cancelled runner and releases the next queued audit', async () => {
    const workRoot = await root();
    let lateProgress: RunAuditOptions['onProgress'];
    let calls = 0;
    const runner = async (options: RunAuditOptions) => {
      calls += 1;
      if (calls > 1) return result(options.jobId, options.configuration, options.url);
      lateProgress = options.onProgress;
      await new Promise<never>((_resolve, reject) => {
        if (options.signal?.aborted) reject(options.signal.reason);
        else options.signal?.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
      });
      throw new Error('unreachable');
    };
    const manager = createManager(workRoot, runner);
    const first = await manager.create('https://example.com/', QUICK_FULL);
    const next = await manager.create('https://example.com/next', QUICK_FULL);
    await waitFor(() => Boolean(lateProgress));
    await manager.cancel(first.id);
    await waitFor(() => manager.get(first.id)?.status === 'CANCELLED' && manager.get(next.id)?.status === 'PASS' && manager.diagnostics().activeCount === 0);
    await lateProgress?.({ stage: 'performance:run-1:measure:90:120', completedCaptures: 2, totalCaptures: 2, progressPercent: 85, completedSteps: 29, totalSteps: 34, remainingSteps: 5 });
    expect(manager.get(first.id)).toMatchObject({ status: 'CANCELLED', currentStage: 'cancelled' });
    const checkpoint = JSON.parse(await fs.readFile(path.join(workRoot, 'checkpoints', first.id, 'audit-state.json'), 'utf8'));
    expect(checkpoint.currentStage).toBe('cancelled');
    expect(manager.diagnostics().controllerIds).toEqual([]);
  });


  it('exposes scheduler diagnostics without a fragile running counter', async () => {
    const workRoot = await root();
    const releases: Array<() => void> = [];
    const runner = async ({ jobId, configuration, url }: { jobId: string; configuration: AuditConfiguration; url: string }) => {
      await new Promise<void>((resolve) => { releases.push(resolve); });
      return result(jobId, configuration, url);
    };
    const manager = createManager(workRoot, runner as never);
    const first = await manager.create('https://example.com/', QUICK_FULL);
    const second = await manager.create('https://example.com/next', QUICK_FULL);
    await waitFor(() => manager.get(first.id)?.status === 'RUNNING' && releases.length === 1);
    expect(manager.diagnostics()).toMatchObject({ activeCount: 1, queueLength: 1, maxConcurrent: 1, initialized: true });
    expect(manager.diagnostics().activeIds).toContain(first.id);
    expect(manager.diagnostics().queuedIds).toContain(second.id);
    releases.shift()?.();
    await waitFor(() => manager.get(first.id)?.status === 'PASS' && manager.get(second.id)?.status === 'RUNNING' && releases.length === 1);
    releases.shift()?.();
    await waitFor(() => manager.get(second.id)?.status === 'PASS');
  });

  it('watchdog aborts a stalled audit and allows the next queued job to start', async () => {
    const workRoot = await root();
    let call = 0;
    const runner = async ({ jobId, configuration, url, signal }: { jobId: string; configuration: AuditConfiguration; url: string; signal?: AbortSignal }) => {
      call += 1;
      if (call === 1) {
        await new Promise<void>((resolve, reject) => {
          if (signal?.aborted) { reject(signal.reason); return; }
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      return result(jobId, configuration, url);
    };
    const manager = createManager(workRoot, runner as never, { stallTimeoutMs: 40 });
    const stalled = await manager.create('https://example.com/stalled', QUICK_FULL);
    const next = await manager.create('https://example.com/next', QUICK_FULL);
    await waitFor(() => manager.get(stalled.id)?.status === 'FAILED' && manager.get(next.id)?.status === 'PASS');
    await waitFor(() => {
      const diagnostics = manager.diagnostics();
      return diagnostics.activeCount === 0 && diagnostics.queueLength === 0 && diagnostics.controllerIds.length === 0;
    });
    expect(manager.get(stalled.id)?.currentStage).toBe('watchdog-timeout');
    expect(manager.get(stalled.id)?.error).toContain('автоматически остановлен');
    expect(call).toBe(2);
  });

});
