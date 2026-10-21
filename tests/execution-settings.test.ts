import { describe, expect, it } from 'vitest';
import { resolveWorkerPlan } from '../audit-engine/orchestrator/execution-settings';
import type { HardwareProfile } from '../audit-engine/shared/types';

const hardware: HardwareProfile = { logicalCpus: 16, totalMemoryGb: 32, freeMemoryGb: 20, safeWorkerCapacity: 5, recommendedPowerMode: 'MAX' };

describe('execution power modes', () => {
  it('keeps ECO serial and scales FAST without exceeding the hardware safety cap', () => {
    expect(resolveWorkerPlan('ECO', hardware).viewportWorkers).toBe(1);
    expect(resolveWorkerPlan('FAST', hardware).viewportWorkers).toBe(4);
    expect(resolveWorkerPlan('MAX', hardware).viewportWorkers).toBe(5);
  });

  it('caps interactions separately from viewport workers', () => {
    expect(resolveWorkerPlan('MAX', hardware).interactionWorkers).toBe(3);
    expect(resolveWorkerPlan('NORMAL', { ...hardware, safeWorkerCapacity: 1 }).interactionWorkers).toBe(1);
  });

  it('uses currently free memory as a safety ceiling instead of installed RAM alone', () => {
    const busyMachine: HardwareProfile = { logicalCpus: 16, totalMemoryGb: 32, freeMemoryGb: 3.2, safeWorkerCapacity: 1, recommendedPowerMode: 'ECO' };
    expect(resolveWorkerPlan('MAX', busyMachine).viewportWorkers).toBe(1);
    expect(resolveWorkerPlan('FAST', busyMachine).interactionWorkers).toBe(1);
  });

});
