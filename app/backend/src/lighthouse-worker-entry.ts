import { runPerformanceAuditInProcess } from '../../../audit-engine/performance/lighthouse-core.js';
import type { PerformanceRunOptions } from '../../../audit-engine/performance/lighthouse-contract.js';
import { redactText } from '../../../audit-engine/privacy/redaction.js';

type StartOptions = Pick<PerformanceRunOptions, 'url' | 'outputDir' | 'chromePath' | 'runTimeoutMs'>;
type ParentMessage =
  | { type: 'start'; options: StartOptions }
  | { type: 'cancel'; reason?: string };

let running = false;
const controller = new AbortController();

function send(message: unknown): void {
  try { if (process.connected && process.send) process.send(message); }
  catch { /* parent is already gone */ }
}

function finish(message: unknown, code: number): void {
  const exit = () => process.exit(code);
  try {
    if (process.connected && process.send) {
      process.send(message, (error: Error | null) => process.exit(error ? 1 : code));
      return;
    }
  } catch { /* fall through */ }
  exit();
}

const heartbeat = setInterval(() => send({ type: 'heartbeat', at: Date.now() }), 1_000);
heartbeat.unref?.();

process.on('disconnect', () => {
  if (!controller.signal.aborted) controller.abort(new Error('Lighthouse isolate parent disconnected.'));
});

process.on('message', (raw: unknown) => {
  const message = raw as { type?: ParentMessage['type']; options?: StartOptions; reason?: string };
  if (message.type === 'cancel') {
    if (!controller.signal.aborted) controller.abort(new Error(message.reason || 'Lighthouse isolate cancelled.'));
    return;
  }
  if (message.type !== 'start' || !message.options || running) return;
  running = true;
  const options = message.options as StartOptions;
  void runPerformanceAuditInProcess({
    ...options,
    signal: controller.signal,
    onRunProgress: (progress) => { send({ type: 'progress', progress }); },
    onRunComplete: (completedRuns, totalRuns) => { send({ type: 'run-complete', completedRuns, totalRuns }); },
  }).then(
    (evidence) => finish({ type: 'result', evidence }, 0),
    (error: unknown) => finish({ type: 'error', error: redactText(error instanceof Error ? error.message : String(error)) }, 1),
  );
});

send({ type: 'ready' });
