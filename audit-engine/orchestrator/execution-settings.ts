import os from 'node:os';
import type { AuditPowerMode, HardwareProfile } from '../shared/types.js';

export interface WorkerPlan {
  requestedPowerMode: AuditPowerMode;
  viewportWorkers: number;
  interactionWorkers: number;
  hardware: HardwareProfile;
}

export function detectHardwareProfile(): HardwareProfile {
  const logicalCpus = Math.max(1, os.cpus().length);
  const totalMemoryGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
  const freeMemoryGb = Math.round((os.freemem() / 1024 ** 3) * 10) / 10;
  const cpuCapacity = Math.max(1, Math.min(8, logicalCpus - 1));
  // Chromium workers are memory-heavy. Cap parallelism by memory that is actually free now,
  // not only by installed RAM, so FAST/MAX cannot blindly overload a busy workstation.
  const ramCapacity = Math.max(1, Math.min(8, Math.floor(freeMemoryGb / 2.5)));
  const safeWorkerCapacity = Math.max(1, Math.min(cpuCapacity, ramCapacity));

  let recommendedPowerMode: AuditPowerMode = 'NORMAL';
  if (logicalCpus <= 4 || totalMemoryGb < 8 || freeMemoryGb < 4) recommendedPowerMode = 'ECO';
  else if (logicalCpus >= 12 && totalMemoryGb >= 24 && freeMemoryGb >= 12 && safeWorkerCapacity >= 4) recommendedPowerMode = 'MAX';
  else if (logicalCpus >= 8 && totalMemoryGb >= 16 && freeMemoryGb >= 8 && safeWorkerCapacity >= 3) recommendedPowerMode = 'FAST';

  return { logicalCpus, totalMemoryGb, freeMemoryGb, safeWorkerCapacity, recommendedPowerMode };
}

export function resolveWorkerPlan(powerMode: AuditPowerMode, hardware = detectHardwareProfile()): WorkerPlan {
  const requestedViewportWorkers: Record<AuditPowerMode, number> = { ECO: 1, NORMAL: 2, FAST: 4, MAX: 6 };
  const requestedInteractionWorkers: Record<AuditPowerMode, number> = { ECO: 1, NORMAL: 1, FAST: 2, MAX: 3 };
  return {
    requestedPowerMode: powerMode,
    viewportWorkers: Math.max(1, Math.min(requestedViewportWorkers[powerMode], hardware.safeWorkerCapacity)),
    interactionWorkers: Math.max(1, Math.min(requestedInteractionWorkers[powerMode], hardware.safeWorkerCapacity)),
    hardware,
  };
}
