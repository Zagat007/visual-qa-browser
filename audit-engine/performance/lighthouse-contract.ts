export const COLD_RUNS = 3;
export const RUN_TIMEOUT_MS = 120_000;

export interface PerformanceRunProgress {
  run: number;
  totalRuns: number;
  phase: 'launch' | 'connect' | 'guard' | 'measure' | 'save';
  elapsedMs: number;
  timeoutMs: number;
}

export interface PerformanceRunOptions {
  url: string;
  outputDir: string;
  chromePath?: string;
  signal?: AbortSignal;
  runTimeoutMs?: number;
  onRunProgress?: (progress: PerformanceRunProgress) => void | Promise<void>;
  onRunComplete?: (completedRuns: number, totalRuns: number) => void | Promise<void>;
}
