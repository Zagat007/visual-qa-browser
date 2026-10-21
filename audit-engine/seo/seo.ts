import type { Page } from 'playwright';
import { redactUrl } from '../privacy/redaction.js';
import type { SeoEvidence } from '../shared/types.js';

export async function collectSeoEvidence(page: Page): Promise<SeoEvidence> {
  const raw = await page.evaluate(() => {
    const meta = (name: string): string => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content?.trim() ?? '';
    const property = (name: string): string => document.querySelector<HTMLMetaElement>(`meta[property="${name}"]`)?.content?.trim() ?? '';
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? '';
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 300).map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 160),
    }));
    const headingJumps: Array<{ from: number; to: number; index: number }> = [];
    for (let index = 1; index < headings.length; index += 1) {
      const previous = headings[index - 1];
      const current = headings[index];
      if (previous && current && current.level - previous.level > 1) headingJumps.push({ from: previous.level, to: current.level, index });
    }
    return {
      title: document.title.trim(),
      description: meta('description'),
      canonical,
      robots: meta('robots'),
      viewport: meta('viewport'),
      lang: document.documentElement.lang.trim(),
      openGraph: {
        title: property('og:title'),
        description: property('og:description'),
        image: property('og:image'),
        url: property('og:url'),
        type: property('og:type'),
      },
      twitter: {
        card: meta('twitter:card'),
        title: meta('twitter:title'),
        description: meta('twitter:description'),
        image: meta('twitter:image'),
      },
      h1Count: document.querySelectorAll('h1').length,
      headings,
      headingJumps,
      noindex: /(?:^|,)\s*noindex\b/i.test(meta('robots')),
    };
  });

  const findings: SeoEvidence['findings'] = [];
  if (!raw.title) findings.push({ rule: 'missing-title', severity: 'P2', message: 'Document title is empty.' });
  if (!raw.description) findings.push({ rule: 'missing-description', severity: 'P3', message: 'Meta description is missing.' });
  if (raw.h1Count === 0) findings.push({ rule: 'missing-h1', severity: 'P2', message: 'No H1 heading detected.' });
  if (raw.h1Count > 1) findings.push({ rule: 'multiple-h1', severity: 'P3', message: `${raw.h1Count} H1 headings detected.` });
  if (!raw.lang) findings.push({ rule: 'missing-lang', severity: 'P2', message: 'html[lang] is missing.' });
  if (!raw.viewport) findings.push({ rule: 'missing-viewport-meta', severity: 'P2', message: 'Viewport meta tag is missing.' });
  if (raw.headingJumps.length > 0) findings.push({ rule: 'heading-order-jump', severity: 'P3', message: `${raw.headingJumps.length} heading-level jump(s) detected.` });

  return {
    auditStatus: findings.length > 0 ? 'ISSUE' : 'PASS',
    ...raw,
    canonical: raw.canonical ? redactUrl(raw.canonical) : '',
    openGraph: {
      ...raw.openGraph,
      image: raw.openGraph.image ? redactUrl(raw.openGraph.image) : '',
      url: raw.openGraph.url ? redactUrl(raw.openGraph.url) : '',
    },
    twitter: {
      ...raw.twitter,
      image: raw.twitter.image ? redactUrl(raw.twitter.image) : '',
    },
    findings,
  };
}
