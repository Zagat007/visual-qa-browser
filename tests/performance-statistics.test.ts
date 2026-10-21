import { describe, expect, it } from 'vitest';
import { median, medianNullable } from '../audit-engine/performance/statistics.js';

describe('performance statistics', () => {
  it('returns the middle value for an odd sample', () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it('averages the middle pair for an even sample', () => {
    expect(median([40, 10, 30, 20])).toBe(25);
  });

  it('drops null and non-finite measurements', () => {
    expect(medianNullable([null, 3, Number.NaN, 1, 2])).toBe(2);
  });

  it('returns null when no finite measurement exists', () => {
    expect(median([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });
});
