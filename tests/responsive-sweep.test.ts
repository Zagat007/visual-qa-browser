import { describe, expect, it } from 'vitest';
import { analyzeResponsiveSamples } from '../audit-engine/responsive/sweep';
import type { ResponsiveSample } from '../audit-engine/shared/types';

function sample(overrides: Partial<ResponsiveSample>): ResponsiveSample {
  return {
    width: 390,
    documentWidth: 390,
    documentHeight: 2400,
    horizontalOverflowPx: 0,
    mainWidth: 358,
    h1MaxLines: 2,
    h2MaxLines: 2,
    ...overrides,
  };
}

describe('responsive continuity analyzer', () => {
  it('marks confirmed horizontal overflow as high-confidence evidence', () => {
    const findings = analyzeResponsiveSamples([
      sample({ width: 390, documentWidth: 414, horizontalOverflowPx: 24 }),
    ]);
    expect(findings).toContainEqual(expect.objectContaining({
      rule: 'responsive-overflow',
      confidence: 'HIGH',
      fromWidth: 390,
      toWidth: 390,
    }));
  });

  it('keeps breakpoint-style jumps as low-confidence review candidates', () => {
    const findings = analyzeResponsiveSamples([
      sample({ width: 767, mainWidth: 735, h1MaxLines: 1, documentHeight: 1800 }),
      sample({ width: 768, mainWidth: 500, h1MaxLines: 3, documentHeight: 2600 }),
    ]);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'heading-line-jump', confidence: 'LOW' }),
      expect.objectContaining({ rule: 'document-height-jump', confidence: 'LOW' }),
      expect.objectContaining({ rule: 'container-width-jump', confidence: 'LOW' }),
    ]));
  });
});
