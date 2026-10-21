import type { AuditModule, GeometryEvidence, InteractionAuditEvidence, SiteTechnicalEvidence } from '../shared/types.js';

export function interactionIncompleteReasons(audit: InteractionAuditEvidence): string[] {
  const reasons: string[] = [];
  if (audit.discoveryTruncated) reasons.push(`${audit.viewport.name}: interaction discovery truncated`);
  if (audit.activationLimitReached) reasons.push(`${audit.viewport.name}: interaction activation limit reached`);
  if (audit.failed > 0) reasons.push(`${audit.viewport.name}: ${audit.failed} interaction check(s) failed and remain NOT VERIFIED`);
  if (audit.forms.formsTruncated) reasons.push(`${audit.viewport.name}: form inventory truncated`);
  if (audit.forms.fieldsTruncated) reasons.push(`${audit.viewport.name}: form-field inventory truncated`);
  if (audit.runtime.limits.consoleDropped > 0 || audit.runtime.limits.pageErrorsDropped > 0 || audit.runtime.limits.networkDropped > 0 || (audit.runtime.limits.textTruncated ?? 0) > 0) {
    reasons.push(`${audit.viewport.name}: interaction runtime evidence dropped by collection limits`);
  }
  return reasons;
}

export function confirmedInteractionIssueCount(audits: InteractionAuditEvidence[], modules: ReadonlySet<AuditModule>): number {
  if (!modules.has('FORMS')) return 0;
  return audits.reduce((sum, audit) => sum + audit.forms.findings.filter((finding) =>
    finding.rule !== 'small-control-target' && ['P0', 'P1', 'P2'].includes(finding.severity),
  ).length, 0);
}

export function confirmedGeometryIssueCount(findings: GeometryEvidence['findings']): number {
  return findings.filter((finding) =>
    finding.confidence === 'HIGH'
    && (finding.rule === 'horizontal-overflow' || finding.rule === 'zero-size-interactive'),
  ).length;
}

export function confirmedSiteTechnicalIssueCount(siteTechnical: SiteTechnicalEvidence | null, seoEnabled: boolean): number {
  if (!seoEnabled || !siteTechnical) return 0;
  // SPA_FALLBACK is a review candidate because SPA routing can be intentional.
  // Only a confirmed SOFT_404 changes the target verdict to ISSUE.
  return siteTechnical.soft404.verdict === 'SOFT_404' ? 1 : 0;
}

export function siteTechnicalIncompleteReasons(siteTechnical: SiteTechnicalEvidence | null, seoEnabled: boolean): string[] {
  if (!seoEnabled || !siteTechnical) return [];
  const reasons: string[] = [];
  if (siteTechnical.soft404.verdict === 'NOT_VERIFIED') reasons.push('soft-404 probe was inconclusive');
  return reasons;
}

export function truncationIncompleteReasons(sources: readonly string[]): string[] {
  if (sources.length === 0) return [];
  return [`evidence collection truncated: ${[...new Set(sources)].join(', ')}`];
}
