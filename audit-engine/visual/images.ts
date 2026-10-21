import type { Page } from 'playwright';
import { redactUrl } from '../privacy/redaction.js';
import type { ImageEvidence } from '../shared/types.js';

interface RawImageMetric {
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
  src: string;
  currentSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  intrinsicAspectRatio: number | null;
  renderedAspectRatio: number | null;
  aspectRatioDeltaPct: number | null;
  objectFit: string;
  objectPosition: string;
  loading: string;
  complete: boolean;
  broken: boolean;
  cropCandidate: boolean;
}

export async function collectImageEvidence(page: Page): Promise<ImageEvidence> {
  const raw = await page.evaluate((): RawImageMetric[] => {
    const describe = (element: Element): string => {
      const html = element as HTMLElement;
      const tag = element.tagName.toLowerCase();
      if (html.id) return `${tag}#${CSS.escape(html.id)}`;
      const testId = element.getAttribute('data-testid');
      if (testId) return `${tag}[data-testid="${CSS.escape(testId)}"]`;
      const qa = element.getAttribute('data-qa');
      if (qa) return `${tag}[data-qa="${CSS.escape(qa)}"]`;
      const parent = element.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter((item) => item.tagName === element.tagName);
      return `${tag}:nth-of-type(${Math.max(0, siblings.indexOf(element)) + 1})`;
    };
    return Array.from(document.images).slice(0, 500).map((img) => {
    const rect = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    const intrinsicAspectRatio = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : null;
    const renderedAspectRatio = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : null;
    const aspectRatioDeltaPct = intrinsicAspectRatio && renderedAspectRatio
      ? Math.abs(renderedAspectRatio / intrinsicAspectRatio - 1) * 100
      : null;
    const cropCandidate = style.objectFit === 'cover' && aspectRatioDeltaPct !== null && aspectRatioDeltaPct > 3;
    return {
      selector: describe(img),
      rect: {
        x: Math.round((rect.x + window.scrollX) * 10) / 10,
        y: Math.round((rect.y + window.scrollY) * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      },
      src: img.src,
      currentSrc: img.currentSrc,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      renderedWidth: Math.round(rect.width * 10) / 10,
      renderedHeight: Math.round(rect.height * 10) / 10,
      intrinsicAspectRatio: intrinsicAspectRatio === null ? null : Math.round(intrinsicAspectRatio * 1000) / 1000,
      renderedAspectRatio: renderedAspectRatio === null ? null : Math.round(renderedAspectRatio * 1000) / 1000,
      aspectRatioDeltaPct: aspectRatioDeltaPct === null ? null : Math.round(aspectRatioDeltaPct * 10) / 10,
      objectFit: style.objectFit,
      objectPosition: style.objectPosition,
      loading: img.loading,
      complete: img.complete,
      // A pending lazy/network image is incomplete evidence, not a confirmed broken asset.
      broken: img.complete && (img.naturalWidth <= 0 || img.naturalHeight <= 0),
      cropCandidate,
    };
  });
  });
  const metrics = raw.map((item) => ({
    ...item,
    src: item.src ? redactUrl(item.src) : '',
    currentSrc: item.currentSrc ? redactUrl(item.currentSrc) : '',
  }));
  // Group before redaction: distinct signed URLs can otherwise collapse to the
  // same displayed URL and produce a false duplicate-image finding.
  const byUrl = new Map<string, number>();
  for (const item of raw) {
    const key = item.currentSrc || item.src;
    if (!key) continue;
    byUrl.set(key, (byUrl.get(key) ?? 0) + 1);
  }
  const duplicateUrlGroups = [...byUrl.entries()]
    .filter(([, count]) => count > 1)
    .map(([url, count]) => ({ url: redactUrl(url), count }))
    .sort((a, b) => b.count - a.count);
  const totalImages = await page.locator('img').count();
  return {
    totalImages,
    sampledImages: metrics.length,
    truncated: totalImages > metrics.length,
    brokenImages: metrics.filter((item) => item.broken).length,
    cropCandidates: metrics.filter((item) => item.cropCandidate).length,
    duplicateUrlGroups,
    metrics,
  };
}
