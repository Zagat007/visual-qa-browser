import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactText } from '../privacy/redaction.js';
import type { PerformanceEvidence } from '../shared/types.js';
import { COLD_RUNS, RUN_TIMEOUT_MS, type PerformanceRunOptions, type PerformanceRunProgress } from './lighthouse-contract.js';

export type { PerformanceRunOptions, PerformanceRunProgress } from './lighthouse-contract.js';

const ISOLATE_STALL_TIMEOUT_MS = 45_000;
const ISOLATE_CHECK_INTERVAL_MS = 2_000;
const ISOLATE_FORCE_KILL_GRACE_MS = 750;
const ISOLATE_REAP_CONFIRM_MS = 1_000;

type WorkerStartOptions = Pick<PerformanceRunOptions, 'url' | 'outputDir' | 'chromePath' | 'runTimeoutMs'>;
interface WorkerInboundMessage {
  type?: 'ready' | 'heartbeat' | 'progress' | 'run-complete' | 'result' | 'error';
  at?: number;
  progress?: PerformanceRunProgress;
  completedRuns?: number;
  totalRuns?: number;
  evidence?: PerformanceEvidence;
  error?: string;
}
type WorkerOutboundMessage =
  | { type: 'start'; options: WorkerStartOptions }
  | { type: 'cancel'; reason: string };

function workerLaunch(): { command: string; args: string[] } {
  // Test-only worker injection. Production must never accept an arbitrary
  // executable path from the environment for this privileged child process.
  const override = process.env.NODE_ENV === 'test' ? process.env.VQB_LIGHTHOUSE_WORKER_ENTRY : undefined;
  if (override) {
    const resolved = path.resolve(override);
    if (!existsSync(resolved)) throw new Error(`Configured Lighthouse isolate worker is missing: ${resolved}`);
    return { command: process.execPath, args: [resolved] };
  }
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const compiled = path.join(moduleDir, 'lighthouse-worker-entry.js');
  if (existsSync(compiled)) return { command: process.execPath, args: [compiled] };

  const source = path.resolve(process.cwd(), 'app', 'backend', 'src', 'lighthouse-worker-entry.ts');
  if (!existsSync(source)) throw new Error('Lighthouse isolate worker entry is missing. Rebuild the application.');
  // Development/test fallback. Production always uses the compiled worker.
  const loaderFlag = '--im' + 'port';
  return { command: process.execPath, args: [loaderFlag, 'tsx', source] };
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      await new Promise<void>((resolve, reject) => {
        execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5_000 }, (error) => error ? reject(error) : resolve());
      });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
  }
}

function waitForWorkerExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      if (timer) clearTimeout(timer);
      child.removeListener('exit', done);
      resolve();
    };
    child.once('exit', done);
    timer = setTimeout(done, timeoutMs);
  });
}

async function stopOwnedWorker(child: ChildProcess, reason: string): Promise<void> {
  try { if (child.connected) child.send({ type: 'cancel', reason } satisfies WorkerOutboundMessage); }
  catch { /* IPC already closed */ }
  await waitForWorkerExit(child, ISOLATE_FORCE_KILL_GRACE_MS);
  if (child.exitCode === null && child.signalCode === null) await terminateProcessTree(child);
  await waitForWorkerExit(child, ISOLATE_REAP_CONFIRM_MS);
}

function workerStartOptions(options: PerformanceRunOptions): WorkerStartOptions {
  return {
    url: options.url,
    outputDir: options.outputDir,
    ...(options.chromePath ? { chromePath: options.chromePath } : {}),
    ...(options.runTimeoutMs !== undefined ? { runTimeoutMs: options.runTimeoutMs } : {}),
  };
}

/**
 * Run Lighthouse outside the HTTP/control-plane process.
 *
 * This boundary is intentional: Lighthouse/Chrome can occasionally wedge a
 * Node event loop or ignore an in-process AbortSignal. Keeping it in a child
 * process guarantees the UI cancellation endpoint remains responsive and lets
 * the parent hard-kill the complete Lighthouse/Chrome process tree.
 */
export async function runPerformanceAudit(options: PerformanceRunOptions): Promise<PerformanceEvidence> {
  options.signal?.throwIfAborted();
  if (options.runTimeoutMs !== undefined && (!Number.isFinite(options.runTimeoutMs) || options.runTimeoutMs <= 0)) throw new Error('Invalid Lighthouse run timeout.');

  const launch = workerLaunch();
  const child = spawn(launch.command, launch.args, {
    cwd: process.cwd(),
    detached: true,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });

  return new Promise<PerformanceEvidence>((resolve, reject) => {
    let settled = false;
    let started = false;
    let resultReceived = false;
    let lastHeartbeatAt = Date.now();
    let stderr = '';
    let callbackChain = Promise.resolve();
    const timeoutMs = options.runTimeoutMs ?? RUN_TIMEOUT_MS;
    const totalDeadlineMs = COLD_RUNS * (timeoutMs + 30_000) + 30_000;
    const totalDeadline = setTimeout(() => fail(new Error(`Lighthouse isolate exceeded its total deadline (${totalDeadlineMs} ms). Performance was not verified.`)), totalDeadlineMs);
    const stallWatch = setInterval(() => {
      if (Date.now() - lastHeartbeatAt > ISOLATE_STALL_TIMEOUT_MS) {
        fail(new Error(`Lighthouse isolate became unresponsive for more than ${ISOLATE_STALL_TIMEOUT_MS / 1000} seconds. Performance was not verified.`));
      }
    }, ISOLATE_CHECK_INTERVAL_MS);
    totalDeadline.unref?.();
    stallWatch.unref?.();

    const remove = () => {
      clearTimeout(totalDeadline);
      clearInterval(stallWatch);
      options.signal?.removeEventListener('abort', onAbort);
      // Keep child error/exit listeners installed until the process is reaped.
      // Removing the last `error` listener from a still-live ChildProcess can
      // turn a late spawn/IPC error into an uncaught exception in the server.
    };
    function fail(error: unknown): void {
      if (settled) return;
      settled = true;
      remove();
      const normalized = error instanceof Error ? error : new Error(String(error));
      // The HTTP cancel endpoint acknowledges the AbortController immediately,
      // but the audit promise settles only after the owned isolate is reaped.
      // This prevents the scheduler from starting the next audit while stale
      // Lighthouse/Chrome descendants are still alive.
      void stopOwnedWorker(child, normalized.message).then(
        () => reject(normalized),
        () => reject(normalized),
      );
    }
    function succeed(evidence: PerformanceEvidence): void {
      if (settled) return;
      settled = true;
      resultReceived = true;
      remove();
      try { if (child.connected) child.disconnect(); } catch { /* already disconnected */ }
      const reap = setTimeout(() => { void terminateProcessTree(child); }, 5_000);
      reap.unref?.();
      resolve(evidence);
    }
    const onAbort = () => fail(options.signal?.reason ?? new Error('Lighthouse performance audit cancelled.'));
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr = `${stderr}${String(chunk)}`.slice(-8_192);
    });
    child.on('error', (error) => fail(error));
    child.on('exit', (code, signal) => {
      if (settled || resultReceived) return;
      const detail = stderr.trim() ? ` ${redactText(stderr.trim())}` : '';
      fail(new Error(`Lighthouse isolate exited before returning evidence (code=${String(code)}, signal=${String(signal)}).${detail}`));
    });
    child.on('message', (raw: unknown) => {
      if (settled) return;
      const message = raw as WorkerInboundMessage;
      lastHeartbeatAt = Date.now();
      if (message.type === 'ready') {
        if (started) return;
        started = true;
        try {
          child.send({ type: 'start', options: workerStartOptions(options) } satisfies WorkerOutboundMessage);
        } catch (error) { fail(error); }
        return;
      }
      if (message.type === 'heartbeat') return;
      if (message.type === 'progress' && message.progress) {
        callbackChain = callbackChain.then(async () => { await options.onRunProgress?.(message.progress as PerformanceRunProgress); });
        void callbackChain.catch(fail);
        return;
      }
      if (message.type === 'run-complete' && typeof message.completedRuns === 'number' && typeof message.totalRuns === 'number') {
        callbackChain = callbackChain.then(async () => { await options.onRunComplete?.(message.completedRuns!, message.totalRuns!); });
        void callbackChain.catch(fail);
        return;
      }
      if (message.type === 'result' && message.evidence) {
        resultReceived = true;
        void callbackChain.then(() => succeed(message.evidence as PerformanceEvidence), fail);
        return;
      }
      if (message.type === 'error') fail(new Error(redactText(String(message.error ?? 'Unknown Lighthouse isolate failure'))));
    });
  });
}
