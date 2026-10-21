import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runAudit } from '../../../audit-engine/orchestrator/run-audit.js';
import { decryptCheckpointSecret, encryptCheckpointSecret } from '../../../audit-engine/privacy/secret-store.js';
import { redactText, redactUrl } from '../../../audit-engine/privacy/redaction.js';
import type { AuditConfiguration, AuditJob, AuditPreset } from '../../../audit-engine/shared/types.js';

interface InternalJob {
  publicJob: AuditJob;
  targetUrl: string;
}

interface JobManagerOptions {
  stallTimeoutMs?: number;
}

export interface JobSchedulerDiagnostics {
  queuedIds: string[];
  activeIds: string[];
  controllerIds: string[];
  queueLength: number;
  activeCount: number;
  maxConcurrent: number;
  initialized: boolean;
  jobs: Array<{
    id: string;
    status: AuditJob['status'];
    stage: string | null;
    progressPercent: number;
    createdAt: string;
    startedAt: string | null;
  }>;
}

const MAX_CONCURRENT = 1;
const MAX_QUEUED = 8;
const DEFAULT_STALL_TIMEOUT_MS = 5 * 60_000;
const DEEP_STALL_TIMEOUT_MS = 10 * 60_000;
const USER_CANCEL_REASON = 'VQB_USER_CANCEL';
const STALL_TIMEOUT_REASON = 'VQB_STALL_TIMEOUT';

type AuditRunner = typeof runAudit;

const FULL_MODULES: AuditConfiguration['modules'] = ['VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'RUNTIME', 'ACCESSIBILITY', 'SEO', 'SECURITY', 'PERFORMANCE'];

function configurationFromLegacyPreset(preset: AuditPreset): AuditConfiguration {
  return { mode: 'FULL', modules: FULL_MODULES, viewportPreset: preset, powerMode: 'NORMAL', interactionDepth: 'KEY' };
}

function stallTimeoutFor(configuration: AuditConfiguration, override?: number): number {
  if (override !== undefined) return override;
  if (configuration.viewportPreset === 'DEEP' || configuration.modules.includes('PERFORMANCE')) return DEEP_STALL_TIMEOUT_MS;
  return DEFAULT_STALL_TIMEOUT_MS;
}

export class JobManager {
  private readonly jobs = new Map<string, InternalJob>();
  private readonly queue: string[] = [];
  private readonly activeIds = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private initializePromise: Promise<void> | null = null;
  private pumpScheduled = false;
  private pendingCreates = 0;

  constructor(
    private readonly rootDir: string,
    private readonly auditRunner: AuditRunner = runAudit,
    private readonly options: JobManagerOptions = {},
  ) {}

  private jobDir(id: string): string {
    return path.join(this.rootDir, 'checkpoints', id);
  }

  private async writeAtomic(filePath: string, contents: string, mode?: number): Promise<void> {
    const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, contents, mode === undefined ? { encoding: 'utf8' } : { encoding: 'utf8', mode });
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async persist(job: AuditJob): Promise<void> {
    const dir = this.jobDir(job.id);
    await fs.mkdir(dir, { recursive: true });
    await this.writeAtomic(path.join(dir, 'audit-state.json'), `${JSON.stringify(job, null, 2)}\n`);
  }

  private async persistTarget(id: string, targetUrl: string): Promise<void> {
    const dir = this.jobDir(id);
    await fs.mkdir(dir, { recursive: true });
    const encrypted = await encryptCheckpointSecret(this.rootDir, targetUrl);
    await this.writeAtomic(path.join(dir, 'target.enc.json'), `${JSON.stringify(encrypted)}\n`, 0o600);
  }

  private async readTarget(id: string): Promise<string> {
    const raw = await fs.readFile(path.join(this.jobDir(id), 'target.enc.json'), 'utf8');
    return decryptCheckpointSecret(this.rootDir, JSON.parse(raw));
  }

  private async forgetTarget(id: string): Promise<void> {
    await fs.rm(path.join(this.jobDir(id), 'target.enc.json'), { force: true });
  }

  async initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.restore();
    return this.initializePromise;
  }

  private async restore(): Promise<void> {
    const root = path.join(this.rootDir, 'checkpoints');
    await fs.mkdir(root, { recursive: true });
    const entries = await fs.readdir(root, { withFileTypes: true });
    const recoveredQueued: Array<{ id: string; createdAt: string }> = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await fs.readFile(path.join(root, entry.name, 'audit-state.json'), 'utf8');
        const publicJob = JSON.parse(raw) as AuditJob;
        if (!publicJob?.id || publicJob.id !== entry.name) continue;
        if (!publicJob.configuration) {
          const legacyPreset: AuditPreset = publicJob.preset === 'STANDARD' || publicJob.preset === 'DEEP' ? publicJob.preset : 'QUICK';
          publicJob.configuration = configurationFromLegacyPreset(legacyPreset);
          publicJob.preset = legacyPreset;
          await this.persist(publicJob);
        }

        let targetUrl = '';
        if (publicJob.status === 'RUNNING') {
          // Browser/runtime state cannot survive a process restart. Never silently
          // requeue an interrupted RUNNING audit: it can monopolize the sole worker.
          publicJob.status = 'NOT_VERIFIED';
          publicJob.currentStage = 'recovery-interrupted';
          publicJob.finishedAt = new Date().toISOString();
          publicJob.error = 'Предыдущий процесс завершился во время аудита. Незавершённый RUNNING job не возобновлён автоматически.';
          await this.persist(publicJob);
          await this.forgetTarget(publicJob.id).catch(() => undefined);
        } else if (publicJob.status === 'QUEUED') {
          try {
            targetUrl = await this.readTarget(publicJob.id);
            publicJob.currentStage = 'recovered-queued';
            delete publicJob.error;
            await this.persist(publicJob);
            recoveredQueued.push({ id: publicJob.id, createdAt: publicJob.createdAt });
          } catch (error) {
            publicJob.status = 'NOT_VERIFIED';
            publicJob.currentStage = 'recovery-failed';
            publicJob.finishedAt = new Date().toISOString();
            publicJob.error = redactText(`Interrupted queued audit could not be resumed: ${error instanceof Error ? error.message : 'checkpoint secret unavailable'}`);
            await this.persist(publicJob);
            await this.forgetTarget(publicJob.id).catch(() => undefined);
          }
        }
        this.jobs.set(publicJob.id, { publicJob, targetUrl });
      } catch {
        // Unrelated/corrupt checkpoint folders are not promoted into valid jobs.
      }
    }
    recoveredQueued
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .forEach(({ id }) => this.queue.push(id));
    this.schedulePump();
  }

  async create(targetUrl: string, configuration: AuditConfiguration): Promise<AuditJob> {
    await this.initialize();
    const pending = this.queue.length + this.activeIds.size + this.pendingCreates;
    if (pending >= MAX_QUEUED) throw new Error(`Audit queue is full (${MAX_QUEUED}). Wait for a running audit to finish.`);

    const publicJob: AuditJob = {
      id: crypto.randomUUID(),
      url: redactUrl(targetUrl),
      preset: configuration.viewportPreset,
      configuration,
      status: 'QUEUED',
      createdAt: new Date().toISOString(),
      currentStage: 'queued',
      completedCaptures: 0,
      totalCaptures: 0,
      progressPercent: 0,
      completedSteps: 0,
      totalSteps: 0,
      remainingSteps: 0,
    };

    // Reserve synchronously: concurrent API handlers otherwise all see the same
    // free capacity while their encrypted checkpoint writes are still pending.
    this.pendingCreates += 1;
    try {
      await this.persistTarget(publicJob.id, targetUrl);
      await this.persist(publicJob);
      this.jobs.set(publicJob.id, { publicJob, targetUrl });
      this.queue.push(publicJob.id);
      this.schedulePump();
      return publicJob;
    } catch (error) {
      await fs.rm(this.jobDir(publicJob.id), { recursive: true, force: true }).catch(() => undefined);
      throw error;
    } finally {
      this.pendingCreates -= 1;
    }
  }

  get(id: string): AuditJob | undefined {
    return this.jobs.get(id)?.publicJob;
  }

  list(): AuditJob[] {
    return [...this.jobs.values()].map((item) => item.publicJob).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  diagnostics(): JobSchedulerDiagnostics {
    return {
      queuedIds: [...this.queue],
      activeIds: [...this.activeIds],
      controllerIds: [...this.controllers.keys()],
      queueLength: this.queue.length,
      activeCount: this.activeIds.size,
      maxConcurrent: MAX_CONCURRENT,
      initialized: this.initializePromise !== null,
      jobs: this.list().slice(0, 20).map((job) => ({
        id: job.id,
        status: job.status,
        stage: job.currentStage ?? null,
        progressPercent: job.progressPercent ?? 0,
        createdAt: job.createdAt,
        startedAt: job.startedAt ?? null,
      })),
    };
  }

  async cancel(id: string): Promise<AuditJob | undefined> {
    await this.initialize();
    const internal = this.jobs.get(id);
    if (!internal) return undefined;
    const job = internal.publicJob;
    if (job.status === 'QUEUED') {
      this.removeFromQueue(id);
      job.status = 'CANCELLED';
      job.currentStage = 'cancelled';
      job.finishedAt = new Date().toISOString();
      job.error = 'Аудит остановлен пользователем до запуска.';
      internal.targetUrl = '';
      await this.persist(job);
      await this.forgetTarget(id).catch(() => undefined);
      this.schedulePump();
      return job;
    }
    if (job.status === 'RUNNING') {
      const controller = this.controllers.get(id);
      if (!controller) {
        job.status = 'FAILED';
        job.currentStage = 'scheduler-inconsistent';
        job.finishedAt = new Date().toISOString();
        job.error = 'Scheduler inconsistency: RUNNING job has no cancellation controller.';
        internal.targetUrl = '';
        this.activeIds.delete(id);
        await this.persist(job);
        await this.forgetTarget(id).catch(() => undefined);
        this.schedulePump();
        return job;
      }
      // Publish cancellation intent immediately. The actual runner may still
      // be unwinding, but the control plane must acknowledge the user's command
      // without waiting for Lighthouse/Chromium cleanup.
      job.currentStage = 'cancelling';
      controller.abort(new Error(USER_CANCEL_REASON));
      // Do not start a second asynchronous checkpoint write here: it could
      // race the terminal CANCELLED persist in execute(). In-memory state is
      // returned immediately; execute() owns the durable terminal write.
      return job;
    }
    return job;
  }

  private removeFromQueue(id: string): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index] === id) this.queue.splice(index, 1);
    }
  }

  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  private pump(): void {
    while (this.activeIds.size < MAX_CONCURRENT && this.queue.length > 0) {
      const id = this.queue.shift();
      if (!id) return;
      const internal = this.jobs.get(id);
      if (!internal || internal.publicJob.status !== 'QUEUED') continue;
      if (!internal.targetUrl) {
        internal.publicJob.status = 'NOT_VERIFIED';
        internal.publicJob.currentStage = 'scheduler-missing-target';
        internal.publicJob.finishedAt = new Date().toISOString();
        internal.publicJob.error = 'Queued audit has no recoverable target URL.';
        void this.persist(internal.publicJob).finally(() => this.schedulePump());
        continue;
      }

      this.activeIds.add(id);
      void this.execute(id).catch(async (error) => {
        const current = this.jobs.get(id)?.publicJob;
        if (current && (current.status === 'QUEUED' || current.status === 'RUNNING')) {
          current.status = 'FAILED';
          current.currentStage = 'scheduler-execution-failed';
          current.finishedAt = new Date().toISOString();
          current.error = redactText(error instanceof Error ? error.message : 'Scheduler execution failure');
          await this.persist(current).catch(() => undefined);
        }
      }).finally(() => {
        this.activeIds.delete(id);
        this.controllers.delete(id);
        this.schedulePump();
      });
    }
  }

  private async execute(id: string): Promise<void> {
    const internal = this.jobs.get(id);
    if (!internal || !internal.targetUrl) return;
    const job = internal.publicJob;
    const controller = new AbortController();
    this.controllers.set(id, controller);

    const stallTimeoutMs = stallTimeoutFor(job.configuration, this.options.stallTimeoutMs);
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const armWatchdog = (): void => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        if (!controller.signal.aborted) controller.abort(new Error(STALL_TIMEOUT_REASON));
      }, stallTimeoutMs);
      watchdog.unref?.();
    };

    job.status = 'RUNNING';
    job.startedAt = new Date().toISOString();
    job.currentStage = 'preflight';
    armWatchdog();

    try {
      await this.persist(job);
      const result = await this.auditRunner({
        rootDir: this.rootDir,
        jobId: job.id,
        url: internal.targetUrl,
        configuration: job.configuration,
        signal: controller.signal,
        onProgress: async (progress) => {
          if (controller.signal.aborted || job.status !== 'RUNNING') return;
          armWatchdog();
          job.currentStage = progress.stage;
          job.completedCaptures = progress.completedCaptures;
          job.totalCaptures = progress.totalCaptures;
          job.progressPercent = progress.progressPercent;
          job.completedSteps = progress.completedSteps;
          job.totalSteps = progress.totalSteps;
          job.remainingSteps = progress.remainingSteps;
          if (progress.currentViewport) job.currentViewport = progress.currentViewport; else delete job.currentViewport;
          if (progress.currentSubsystem) job.currentSubsystem = progress.currentSubsystem; else delete job.currentSubsystem;
          await this.persist(job);
        },
      });
      controller.signal.throwIfAborted();
      job.status = result.status;
      job.currentStage = 'complete';
      job.completedCaptures = result.captures.length;
      job.progressPercent = 100;
      job.completedSteps = job.totalSteps ?? job.completedSteps ?? 0;
      job.remainingSteps = 0;
      delete job.currentViewport;
      job.currentSubsystem = 'REPORT';
      job.finishedAt = result.finishedAt;
      job.reportUrl = `/reports/${result.reportRelativePath}`;
      job.gptPromptUrl = job.reportUrl.replace(/report\.html$/, 'gpt-fix-prompt.txt');
      job.gptEvidenceUrl = job.reportUrl.replace(/report\.html$/, 'gpt-evidence.zip');
      if (result.artDirection) {
        job.artDirectionUrl = job.reportUrl.replace(/report\.html$/, 'art-direction.json');
        job.artEvidenceUrl = job.reportUrl.replace(/report\.html$/, 'art-direction-evidence.json');
        job.artImageBoardUrl = job.reportUrl.replace(/report\.html$/, 'image-review-board.html');
        job.artManualPromptUrl = job.reportUrl.replace(/report\.html$/, 'art-direction-prompt.txt');
        job.premiumGptPromptUrl = job.reportUrl.replace(/report\.html$/, 'gpt-premium-fix-prompt.txt');
      } else {
        delete job.artDirectionUrl;
        delete job.artEvidenceUrl;
        delete job.artImageBoardUrl;
        delete job.artManualPromptUrl;
        delete job.premiumGptPromptUrl;
      }
    } catch (error) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason instanceof Error ? controller.signal.reason.message : String(controller.signal.reason ?? '');
        if (reason === STALL_TIMEOUT_REASON) {
          job.status = 'FAILED';
          job.currentStage = 'watchdog-timeout';
          job.finishedAt = new Date().toISOString();
          job.error = `Аудит автоматически остановлен: не было прогресса более ${Math.ceil(stallTimeoutMs / 60_000)} мин. PASS не присваивается.`;
        } else {
          job.status = 'CANCELLED';
          job.currentStage = 'cancelled';
          job.finishedAt = new Date().toISOString();
          job.error = 'Аудит остановлен пользователем. Незавершённый запуск не получает PASS.';
        }
      } else {
        job.status = 'FAILED';
        job.currentStage = 'failed';
        job.finishedAt = new Date().toISOString();
        job.error = redactText(error instanceof Error ? error.message : 'Unknown audit failure');
      }
    } finally {
      if (watchdog) clearTimeout(watchdog);
      this.controllers.delete(id);
      internal.targetUrl = '';
      await this.persist(job);
      await this.forgetTarget(id).catch(() => undefined);
    }
  }
}
