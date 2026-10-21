import { describe, expect, it } from 'vitest';
import { classifySoft404, textSimilarity } from '../audit-engine/seo/soft404';

describe('soft-404 classifier', () => {
  it('recognizes real HTTP 404/410 responses', () => {
    expect(classifySoft404(404, 'anything', 0)).toBe('REAL_404');
    expect(classifySoft404(410, 'anything', 0)).toBe('REAL_404');
  });

  it('recognizes English and Russian soft-404 content returned with 2xx', () => {
    expect(classifySoft404(200, 'Page not found', 0)).toBe('SOFT_404');
    expect(classifySoft404(200, 'Страница не найдена', 0)).toBe('SOFT_404');
    expect(classifySoft404(200, 'Запрошенный материал не найден', 0)).toBe('SOFT_404');
  });

  it('marks highly similar unknown routes as SPA fallback candidates', () => {
    expect(classifySoft404(200, 'ordinary content', 0.91)).toBe('SPA_FALLBACK');
  });

  it('keeps inconclusive responses NOT_VERIFIED', () => {
    expect(classifySoft404(null, '', 0)).toBe('NOT_VERIFIED');
    expect(classifySoft404(200, 'A distinct valid-looking page', 0.2)).toBe('NOT_VERIFIED');
  });

  it('computes Unicode-aware similarity', () => {
    const score = textSimilarity('Музыка подарок любовь семья', 'Подарок музыка семья любовь');
    expect(score).toBeGreaterThan(0.9);
  });
});
