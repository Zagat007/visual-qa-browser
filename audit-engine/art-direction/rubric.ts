import type { ArtDirectionFinding, ArtDirectionLayer, ArtDirectionRootCause, ArtDirectionReview } from '../shared/types.js';
import type { ProviderReviewPayload } from './provider.js';

const WEIGHTS: Readonly<Record<keyof ArtDirectionReview['subscores'], number>> = {
  visualHierarchy: 15,
  typography: 10,
  spacingRhythm: 10,
  imageQuality: 10,
  imageSemanticFit: 10,
  imageVariety: 10,
  composition: 10,
  brandConsistency: 10,
  premiumPerception: 10,
  conversionPresentation: 5,
};


const SCORE_LAYERS: Readonly<Record<keyof ArtDirectionReview['subscores'], readonly ArtDirectionLayer[]>> = {
  visualHierarchy: ['VISUAL_HIERARCHY'],
  typography: ['TYPOGRAPHY_SPACING'],
  spacingRhythm: ['TYPOGRAPHY_SPACING'],
  imageQuality: ['IMAGE_QUALITY_VARIETY'],
  imageSemanticFit: ['SEMANTIC_IMAGE_FIT'],
  imageVariety: ['IMAGE_QUALITY_VARIETY'],
  composition: ['PREMIUM_QUALITY', 'MOBILE', 'DESKTOP'],
  brandConsistency: ['PREMIUM_QUALITY', 'CROSS_SECTION', 'CROSS_PAGE'],
  premiumPerception: ['PREMIUM_QUALITY'],
  conversionPresentation: ['CONVERSION'],
};

const CATEGORY_LAYERS: Readonly<Record<ArtDirectionFinding['category'], readonly ArtDirectionLayer[]>> = {
  ART_DIRECTION: ['PREMIUM_QUALITY', 'CROSS_SECTION', 'CROSS_PAGE', 'MOBILE', 'DESKTOP'],
  IMAGE_RELEVANCE: ['SEMANTIC_IMAGE_FIT'],
  IMAGE_VARIETY: ['IMAGE_QUALITY_VARIETY'],
  VISUAL_MONOTONY: ['IMAGE_QUALITY_VARIETY', 'CROSS_SECTION', 'CROSS_PAGE'],
  PREMIUM_QUALITY: ['PREMIUM_QUALITY'],
  TYPOGRAPHY: ['TYPOGRAPHY_SPACING'],
  COMPOSITION: ['PREMIUM_QUALITY', 'MOBILE', 'DESKTOP'],
  SPACING: ['TYPOGRAPHY_SPACING'],
  HIERARCHY: ['VISUAL_HIERARCHY'],
  EMOTIONAL_FIT: ['EMOTIONAL_FIT'],
  CONVERSION: ['CONVERSION'],
  CONSISTENCY: ['CROSS_SECTION', 'CROSS_PAGE'],
  CONTENT_DENSITY: ['TYPOGRAPHY_SPACING', 'VISUAL_HIERARCHY'],
  VISUAL_STORYTELLING: ['PREMIUM_QUALITY', 'IMAGE_QUALITY_VARIETY', 'CROSS_SECTION', 'CROSS_PAGE'],
};

function normalize(value: string): string { return value.toLowerCase().replace(/[^a-zа-я0-9]+/gi, ' ').trim().slice(0, 120); }
function clampScore(value: number): number { return Math.max(0, Math.min(100, Math.round(value))); }

function isGenericRecommendation(value: string): boolean {
  const normalized = normalize(value);
  if (normalized.length < 18) return true;
  return [
    'сделать дизайн современнее', 'улучшить визуал', 'добавить больше воздуха', 'использовать качественные изображения', 'сделать cta заметнее',
    'make design more modern', 'improve visuals', 'add more whitespace', 'use better images', 'make cta more visible',
  ].some((phrase) => normalized === normalize(phrase));
}

function containsIdentityClaim(value: string): boolean {
  return /\b(?:same person|same real person|identical person|recognize(?:d)? person|face identity)\b/i.test(value)
    || /(?:тот же|один и тот же|одинаковый)\s+(?:реальный\s+)?(?:человек|мужчина|женщина|персона)/i.test(value)
    || /распозна(?:н|в)\w*\s+(?:лиц|человек)/i.test(value);
}

function containsUnsupportedConversionClaim(value: string): boolean {
  return /(?:conversion|конверси\w*)[^.\n]{0,50}\b\d+(?:[.,]\d+)?\s*%|\b\d+(?:[.,]\d+)?\s*%[^.\n]{0,50}(?:conversion|конверси\w*)/i.test(value);
}

function categoryEnabled(category: ArtDirectionFinding['category'], layers: readonly ArtDirectionLayer[] | undefined): boolean {
  if (!layers) return true;
  const allowed = CATEGORY_LAYERS[category];
  return allowed.some((layer) => layers.includes(layer));
}

function normalizeAlternatives(alternatives: ProviderReviewPayload['findings'][number]['alternatives']): ArtDirectionFinding['alternatives'] {
  const limited = alternatives.slice(0, 3).map((item) => ({ ...item, label: item.label.trim(), description: item.description.trim() }));
  if (limited.length === 0) return [];
  const firstRecommended = limited.findIndex((item) => item.recommended);
  return limited.map((item, index) => ({ ...item, recommended: firstRecommended >= 0 ? index === firstRecommended : index === 0 }));
}

export function enabledArtSubscores(subscores: ProviderReviewPayload['subscores'], layers?: readonly ArtDirectionLayer[]): ArtDirectionReview['subscores'] {
  return Object.fromEntries((Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).map((key) => {
    const enabled = !layers || SCORE_LAYERS[key].some((layer) => layers.includes(layer));
    return [key, enabled ? clampScore(subscores[key]) : null];
  })) as ArtDirectionReview['subscores'];
}

export function computeWeightedArtScore(subscores: ProviderReviewPayload['subscores'], layers?: readonly ArtDirectionLayer[]): number | null {
  let weightedTotal = 0;
  let enabledWeight = 0;
  for (const [key, weight] of Object.entries(WEIGHTS) as Array<[keyof typeof WEIGHTS, number]>) {
    if (layers && !SCORE_LAYERS[key].some((layer) => layers.includes(layer))) continue;
    weightedTotal += clampScore(subscores[key]) * weight;
    enabledWeight += weight;
  }
  return enabledWeight > 0 ? Math.round(weightedTotal / enabledWeight) : null;
}

export function filterAndNormalizeFindings(payload: ProviderReviewPayload, layers?: readonly ArtDirectionLayer[]): { findings: ArtDirectionFinding[]; rootCauses: ArtDirectionRootCause[] } {
  const dedupe = new Set<string>();
  const findings: ArtDirectionFinding[] = [];
  for (const raw of payload.findings) {
    if (!categoryEnabled(raw.category, layers)) continue;
    if (raw.confidence === 'LOW' && raw.priority !== 'OPTIONAL_POLISH') continue;
    if (!raw.observation.trim() || !raw.recommendation.trim() || raw.evidence.length === 0) continue;
    if (isGenericRecommendation(raw.recommendation) || !raw.implementationHint.trim()) continue;
    const combinedText = [raw.observation, raw.impact, raw.recommendation, raw.implementationHint, raw.expectedImprovement].join(' ');
    if (containsIdentityClaim(combinedText)) continue;
    if (raw.category === 'CONVERSION' && containsUnsupportedConversionClaim(combinedText)) continue;
    const fingerprint = [raw.category, raw.viewport, raw.section, normalize(raw.observation), normalize(raw.recommendation)].join('|');
    if (dedupe.has(fingerprint)) continue;
    dedupe.add(fingerprint);
    findings.push({
      artId: `ART-${String(findings.length + 1).padStart(3, '0')}`,
      rootCauseKey: normalize(raw.rootCauseKey || raw.category), rootCauseId: '', page: raw.page, section: raw.section, viewport: raw.viewport,
      category: raw.category, score: clampScore(raw.score), confidence: raw.confidence, priority: raw.priority,
      observation: raw.observation.trim(), evidence: raw.evidence.map((item) => item.trim()).filter(Boolean).slice(0, 12),
      impact: raw.impact.trim(), recommendation: raw.recommendation.trim(), implementationHint: raw.implementationHint.trim(),
      expectedImprovement: raw.expectedImprovement.trim(), alternatives: normalizeAlternatives(raw.alternatives), status: 'OPEN',
    });
  }
  const groups = new Map<string, ArtDirectionFinding[]>();
  for (const finding of findings) {
    const key = finding.rootCauseKey || finding.category;
    const group = groups.get(key) ?? [];
    group.push(finding); groups.set(key, group);
  }
  const rootCauses: ArtDirectionRootCause[] = [];
  let index = 1;
  for (const [key, group] of groups) {
    const id = `ROOT-ART-${String(index++).padStart(2, '0')}`;
    for (const finding of group) finding.rootCauseId = id;
    rootCauses.push({ id, key, title: group[0]?.observation.slice(0, 180) || key, findingIds: group.map((item) => item.artId) });
  }
  return { findings, rootCauses };
}

export function advisoryStatus(findings: ArtDirectionFinding[]): 'PASS' | 'ISSUE' {
  return findings.some((item) => item.priority === 'STRONGLY_RECOMMENDED' || item.priority === 'SHOULD_CONSIDER') ? 'ISSUE' : 'PASS';
}
