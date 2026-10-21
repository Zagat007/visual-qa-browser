import type { AuditStatus } from '../shared/types.js';

export interface VerdictInput {
  completedCaptures: number;
  requestedCaptures: number;
  incompleteReasons: string[];
  issueCount: number;
}

export function determineAuditStatus(input: VerdictInput): { status: AuditStatus; fullPassEligible: boolean } {
  if (input.completedCaptures === 0) return { status: 'FAILED', fullPassEligible: false };
  const fullPassEligible = input.completedCaptures === input.requestedCaptures && input.incompleteReasons.length === 0;
  if (!fullPassEligible) return { status: 'PARTIAL', fullPassEligible: false };
  return { status: input.issueCount > 0 ? 'ISSUE' : 'PASS', fullPassEligible: true };
}
