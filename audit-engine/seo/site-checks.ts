import type { Browser, Page, Response } from 'playwright';
import { attachRuntimeCollector } from '../runtime/collector.js';
import { installSafeMode } from '../security/safe-mode.js';
import { redactText, redactUrl } from '../privacy/redaction.js';
import type { SiteTechnicalEvidence } from '../shared/types.js';
import { classifySoft404, textSimilarity } from './soft404.js';

async function responseSummary(response: Response | null): Promise<{ status: number | null; contentType: string; sample: string }> {
  if (!response) return { status: null, contentType: '', sample: '' };
  let sample = '';
  try {
    sample = redactText((await response.text()).slice(0, 8_000));
  } catch {
    sample = '';
  }
  return { status: response.status(), contentType: response.headers()['content-type'] ?? '', sample };
}

async function renderedSummary(page: Page): Promise<{ title: string; text: string; canonical: string; robots: string }> {
  const raw = await page.evaluate(() => ({
    title: document.title,
    text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 100_000),
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? '',
    robots: document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? '',
  }));
  return {
    ...raw,
    text: redactText(raw.text),
    canonical: raw.canonical ? redactUrl(raw.canonical) : '',
  };
}

export async function runSiteTechnicalChecks(browser: Browser, targetUrl: string, nonce: string): Promise<SiteTechnicalEvidence> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  let runtime: ReturnType<typeof attachRuntimeCollector> | null = null;
  await installSafeMode(context, () => {
    if (!runtime) throw new Error('Site technical Safe Mode runtime is not bound.');
    return runtime;
  });
  const page = await context.newPage();
  runtime = attachRuntimeCollector(page);
  const target = new URL(targetUrl);
  const origin = target.origin;

  try {
    const homeResponse = await page.goto(target.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const home = await renderedSummary(page);

    const robotsUrl = new URL('/robots.txt', origin).toString();
    const robotsResponse = await page.goto(robotsUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    const robots = await responseSummary(robotsResponse);

    const sitemapUrl = new URL('/sitemap.xml', origin).toString();
    const sitemapResponse = await page.goto(sitemapUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    const sitemap = await responseSummary(sitemapResponse);

    const softUrl = new URL(`/qa-nonexistent-${nonce.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'probe'}`, origin).toString();
    const softResponse = await page.goto(softUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null);
    const softRendered = await renderedSummary(page).catch(() => ({ title: '', text: '', canonical: '', robots: '' }));
    const similarity = textSimilarity(home.text, softRendered.text);
    const verdict = classifySoft404(softResponse?.status() ?? null, softRendered.text, similarity);

    return {
      homeStatus: homeResponse?.status() ?? null,
      robots: { url: redactUrl(robotsUrl), status: robots.status, contentType: robots.contentType, sample: robots.sample.slice(0, 2_000) },
      sitemap: { url: redactUrl(sitemapUrl), status: sitemap.status, contentType: sitemap.contentType, sample: sitemap.sample.slice(0, 2_000) },
      soft404: {
        url: redactUrl(softUrl),
        status: softResponse?.status() ?? null,
        title: redactText(softRendered.title),
        canonical: softRendered.canonical,
        robots: redactText(softRendered.robots),
        bodySimilarity: Math.round(similarity * 1000) / 1000,
        verdict,
      },
      runtime,
    };
  } finally {
    await context.close();
  }
}
