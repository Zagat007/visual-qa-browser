import { describe, expect, it } from 'vitest';
import { determineAuditStatus } from '../audit-engine/orchestrator/verdict';

describe('audit verdict gate', () => {
  it('forbids PASS when coverage or evidence is incomplete', () => {
    expect(determineAuditStatus({ completedCaptures: 1, requestedCaptures: 2, incompleteReasons: [], issueCount: 0 }).status).toBe('PARTIAL');
    expect(determineAuditStatus({ completedCaptures: 2, requestedCaptures: 2, incompleteReasons: ['geometry truncated'], issueCount: 0 }).status).toBe('PARTIAL');
  });

  it('distinguishes complete issue evidence from a complete pass', () => {
    expect(determineAuditStatus({ completedCaptures: 2, requestedCaptures: 2, incompleteReasons: [], issueCount: 1 })).toEqual({ status: 'ISSUE', fullPassEligible: true });
    expect(determineAuditStatus({ completedCaptures: 2, requestedCaptures: 2, incompleteReasons: [], issueCount: 0 })).toEqual({ status: 'PASS', fullPassEligible: true });
  });

  it('returns FAILED when no capture evidence exists', () => {
    expect(determineAuditStatus({ completedCaptures: 0, requestedCaptures: 2, incompleteReasons: [], issueCount: 0 }).status).toBe('FAILED');
  });
});
