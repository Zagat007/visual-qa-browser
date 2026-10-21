import { describe, expect, it } from 'vitest';
import { advisoryStatus, computeWeightedArtScore, enabledArtSubscores, filterAndNormalizeFindings } from '../audit-engine/art-direction/rubric';
import type { ProviderReviewPayload } from '../audit-engine/art-direction/provider';

function basePayload(): ProviderReviewPayload {
  return {
    overallScore: 84,
    subscores: {
      visualHierarchy: 86, typography: 88, spacingRhythm: 82, imageQuality: 84, imageSemanticFit: 80,
      imageVariety: 75, composition: 85, brandConsistency: 87, premiumPerception: 83, conversionPresentation: 82,
    },
    sectionScores: [],
    findings: [],
    limitations: [],
  };
}

describe('AI Art Director rubric and recommendation filter', () => {
  it('filters unsafe low-confidence priority, removes duplicates and clusters a shared root cause', () => {
    const payload = basePayload();
    payload.findings = [
      {
        rootCauseKey: 'studio portrait repetition', page: '/', section: 'Hero', viewport: 'desktop-1440', category: 'VISUAL_MONOTONY', score: 70,
        confidence: 'HIGH', priority: 'SHOULD_CONSIDER', observation: 'Several major sections repeat the same dark studio portrait treatment.',
        evidence: ['Hero and Result use nearly identical centered portrait composition.'], impact: 'Sections become harder to distinguish visually.',
        recommendation: 'Keep this treatment in fewer sections and introduce a different environmental composition.', implementationHint: 'Replace one image asset or use a wider environmental crop.',
        expectedImprovement: 'Stronger storytelling variety without changing the design system.', alternatives: [],
      },
      {
        rootCauseKey: 'studio portrait repetition', page: '/', section: 'Result', viewport: 'desktop-1440', category: 'IMAGE_VARIETY', score: 72,
        confidence: 'MEDIUM', priority: 'SHOULD_CONSIDER', observation: 'The Result section repeats the portrait treatment already used above.',
        evidence: ['Two sections use centered portrait + dark background.'], impact: 'Visual rhythm becomes repetitive.',
        recommendation: 'Use a detail shot or environmental portrait for Result.', implementationHint: 'Change the Result asset only.',
        expectedImprovement: 'More visual differentiation between sections.', alternatives: [],
      },
      {
        rootCauseKey: 'weak preference', page: '/', section: 'Footer', viewport: 'desktop-1440', category: 'SPACING', score: 88,
        confidence: 'LOW', priority: 'SHOULD_CONSIDER', observation: 'I prefer slightly more space.', evidence: ['Preference only.'], impact: 'Minor.',
        recommendation: 'Add space.', implementationHint: 'Increase margin.', expectedImprovement: 'Subjective.', alternatives: [],
      },
      {
        rootCauseKey: 'studio portrait repetition', page: '/', section: 'Hero', viewport: 'desktop-1440', category: 'VISUAL_MONOTONY', score: 70,
        confidence: 'HIGH', priority: 'SHOULD_CONSIDER', observation: 'Several major sections repeat the same dark studio portrait treatment.',
        evidence: ['Hero and Result use nearly identical centered portrait composition.'], impact: 'Sections become harder to distinguish visually.',
        recommendation: 'Keep this treatment in fewer sections and introduce a different environmental composition.', implementationHint: 'Replace one image asset or use a wider environmental crop.',
        expectedImprovement: 'Stronger storytelling variety without changing the design system.', alternatives: [],
      },
    ];

    const normalized = filterAndNormalizeFindings(payload, ['IMAGE_QUALITY_VARIETY']);
    expect(normalized.findings).toHaveLength(2);
    expect(normalized.rootCauses).toHaveLength(1);
    expect(normalized.rootCauses[0]?.findingIds).toEqual(['ART-001', 'ART-002']);
    expect(normalized.findings.every((item) => item.rootCauseId === normalized.rootCauses[0]?.id)).toBe(true);
    expect(advisoryStatus(normalized.findings)).toBe('ISSUE');
  });


  it('computes overall score locally from the fixed transparent rubric', () => {
    const payload = basePayload();
    payload.subscores.visualHierarchy = 100;
    payload.subscores.conversionPresentation = 0;
    expect(computeWeightedArtScore(payload.subscores)).toBe(81);
  });


  it('does not fabricate full-rubric coverage when only selected Art Direction layers are enabled', () => {
    const payload = basePayload();
    payload.subscores.visualHierarchy = 100;
    payload.subscores.conversionPresentation = 0;
    const layers = ['VISUAL_HIERARCHY'] as const;
    expect(computeWeightedArtScore(payload.subscores, layers)).toBe(100);
    const visible = enabledArtSubscores(payload.subscores, layers);
    expect(visible.visualHierarchy).toBe(100);
    expect(visible.typography).toBeNull();
    expect(visible.conversionPresentation).toBeNull();
    expect(computeWeightedArtScore(payload.subscores, ['EMOTIONAL_FIT'])).toBeNull();
  });

  it('drops identity-recognition claims and unsupported numeric conversion promises', () => {
    const payload = basePayload();
    payload.findings = [
      {
        rootCauseKey: 'identity', page: '/', section: 'Gallery', viewport: 'desktop-1440', category: 'IMAGE_VARIETY', score: 50,
        confidence: 'HIGH', priority: 'STRONGLY_RECOMMENDED', observation: 'This is the same real person as in the Hero.', evidence: ['Two portraits look similar.'], impact: 'Repetition.',
        recommendation: 'Replace the same person with someone else.', implementationHint: 'Change the image asset.', expectedImprovement: 'More variety.', alternatives: [],
      },
      {
        rootCauseKey: 'conversion', page: '/', section: 'CTA', viewport: 'desktop-1440', category: 'CONVERSION', score: 60,
        confidence: 'HIGH', priority: 'STRONGLY_RECOMMENDED', observation: 'CTA competes with secondary actions.', evidence: ['Three buttons have equal visual weight.'], impact: 'Decision clarity is weaker.',
        recommendation: 'Make the primary CTA visually dominant to increase conversion by 20%.', implementationHint: 'Reduce visual weight of secondary actions.', expectedImprovement: '20% conversion uplift.', alternatives: [],
      },
    ];
    const normalized = filterAndNormalizeFindings(payload, ['IMAGE_QUALITY_VARIETY', 'CONVERSION']);
    expect(normalized.findings).toHaveLength(0);
  });

  it('keeps low-confidence observations only as optional polish', () => {
    const payload = basePayload();
    payload.findings = [{
      rootCauseKey: 'optional refinement', page: '/', section: 'Hero', viewport: 'mobile-390', category: 'COMPOSITION', score: 89,
      confidence: 'LOW', priority: 'OPTIONAL_POLISH', observation: 'A slightly different crop may feel calmer.', evidence: ['Current crop is valid and readable.'],
      impact: 'Taste-dependent refinement only.', recommendation: 'Consider testing a small focal shift.', implementationHint: 'Try object-position 48% 50%.',
      expectedImprovement: 'Possible visual refinement with no functional change.', alternatives: [],
    }];
    const normalized = filterAndNormalizeFindings(payload);
    expect(normalized.findings).toHaveLength(1);
    expect(advisoryStatus(normalized.findings)).toBe('PASS');
  });
});
