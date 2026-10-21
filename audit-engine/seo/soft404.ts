import type { Soft404Verdict } from '../shared/types.js';

function normalizedTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
      .slice(0, 10_000),
  );
}

export function textSimilarity(leftText: string, rightText: string): number {
  const left = normalizedTokens(leftText);
  const right = normalizedTokens(rightText);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function classifySoft404(status: number | null, renderedText: string, similarity: number): Soft404Verdict {
  if (status === 404 || status === 410) return 'REAL_404';
  if (status === null) return 'NOT_VERIFIED';

  const englishNotFound = /\b(?:404|not\s+found|page\s+not\s+found)\b/i.test(renderedText);
  const russianNotFound = /(?:страниц[аы]\s+не\s+найден(?:а|о|ы)?|не\s+найден(?:а|о|ы)?)/iu.test(renderedText);
  if (status >= 200 && status < 300 && (englishNotFound || russianNotFound)) return 'SOFT_404';
  if (status >= 200 && status < 300 && similarity >= 0.82) return 'SPA_FALLBACK';
  return 'NOT_VERIFIED';
}
