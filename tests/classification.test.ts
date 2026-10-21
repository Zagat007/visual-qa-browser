import { describe, expect, it } from 'vitest';
import { confirmedGeometryIssueCount, confirmedInteractionIssueCount, confirmedSiteTechnicalIssueCount, interactionIncompleteReasons, siteTechnicalIncompleteReasons, truncationIncompleteReasons } from '../audit-engine/orchestrator/classification';
import type { InteractionAuditEvidence, SiteTechnicalEvidence } from '../audit-engine/shared/types';

function interactionFixture(): InteractionAuditEvidence {
  return {
    viewport: { name: 'desktop-1440', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, orientation: 'landscape' },
    pageUrl: 'https://example.com/', discovered: 1, sampledCandidates: 1, discoveryTruncated: false, activationLimitReached: false,
    testedHover: 0, testedFocus: 0, testedActivation: 0, skippedSafely: 0, failed: 1,
    candidates: [],
    forms: { totalForms: 0, totalFields: 0, formsTruncated: false, fieldsTruncated: false, forms: [], fields: [], findings: [] },
    runtime: { console: [], pageErrors: [], network: [], limits: { consoleDropped: 0, pageErrorsDropped: 0, networkDropped: 0 } },
  };
}

function siteFixture(verdict: SiteTechnicalEvidence['soft404']['verdict']): SiteTechnicalEvidence {
  return {
    homeStatus: 200,
    robots: { url: 'https://example.com/robots.txt', status: 200, contentType: 'text/plain', sample: '' },
    sitemap: { url: 'https://example.com/sitemap.xml', status: 200, contentType: 'application/xml', sample: '' },
    soft404: { url: 'https://example.com/missing', status: 200, title: '', canonical: '', robots: '', bodySimilarity: 0.9, verdict },
    runtime: { console: [], pageErrors: [], network: [], limits: { consoleDropped: 0, pageErrorsDropped: 0, networkDropped: 0 } },
  };
}

describe('target finding classification', () => {
  it('treats interaction automation failures as incomplete evidence, not target defects', () => {
    const audit = interactionFixture();
    expect(confirmedInteractionIssueCount([audit], new Set(['INTERACTIONS']))).toBe(0);
    expect(interactionIncompleteReasons(audit)).toContain('desktop-1440: 1 interaction check(s) failed and remain NOT VERIFIED');
  });

  it('treats bounded runtime text as incomplete evidence rather than a silent PASS', () => {
    const audit = interactionFixture();
    audit.failed = 0;
    audit.runtime.limits.textTruncated = 1;
    expect(interactionIncompleteReasons(audit)).toContain('desktop-1440: interaction runtime evidence dropped by collection limits');
  });


  it('never promotes small-control-target candidates to ISSUE even if severity is raised later', () => {
    const audit = interactionFixture();
    audit.failed = 0;
    audit.forms.findings = [
      { rule: 'small-control-target', severity: 'P2', selector: 'input#tiny', message: 'candidate only' },
      { rule: 'missing-accessible-name', severity: 'P2', selector: 'input#name', message: 'confirmed form defect' },
    ];
    expect(confirmedInteractionIssueCount([audit], new Set(['FORMS']))).toBe(1);
  });

  it('does not promote SPA fallback candidates to ISSUE but counts confirmed soft-404', () => {
    expect(confirmedSiteTechnicalIssueCount(siteFixture('SPA_FALLBACK'), true)).toBe(0);
    expect(confirmedSiteTechnicalIssueCount(siteFixture('SOFT_404'), true)).toBe(1);
  });

  it('turns an inconclusive soft-404 probe into incomplete coverage instead of PASS', () => {
    expect(siteTechnicalIncompleteReasons(siteFixture('NOT_VERIFIED'), true)).toEqual(['soft-404 probe was inconclusive']);
    expect(siteTechnicalIncompleteReasons(siteFixture('SPA_FALLBACK'), true)).toEqual([]);
    expect(siteTechnicalIncompleteReasons(siteFixture('NOT_VERIFIED'), false)).toEqual([]);
  });

  it('does not promote clipping candidates to confirmed target issues', () => {
    expect(confirmedGeometryIssueCount([
      { rule: 'clipping-candidate', severity: 'P2', confidence: 'HIGH', message: 'candidate' },
      { rule: 'horizontal-overflow', severity: 'P2', confidence: 'HIGH', message: 'confirmed overflow' },
    ])).toBe(1);
  });
  it('turns any evidence truncation into an explicit incomplete-coverage reason', () => {
    expect(truncationIncompleteReasons([])).toEqual([]);
    expect(truncationIncompleteReasons(['desktop-1440:geometry', 'desktop-1440:geometry', 'mobile-390:images']))
      .toEqual(['evidence collection truncated: desktop-1440:geometry, mobile-390:images']);
  });

});
