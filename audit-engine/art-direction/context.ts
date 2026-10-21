import type { Page } from 'playwright';
import type { ArtContextEvidence } from '../shared/types.js';

const TEXT_LIMIT = 10_000;
const SECTION_LIMIT = 30;
const CTA_LIMIT = 40;

export async function collectArtContext(page: Page): Promise<ArtContextEvidence> {
  return page.evaluate(({ textLimit, sectionLimit, ctaLimit }) => {
    const clean = (value: string | null | undefined, limit = 1200): string =>
      (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
    const selectorFor = (element: Element): string => {
      const html = element as HTMLElement;
      if (html.id) return `#${CSS.escape(html.id)}`;
      const data = html.getAttribute('data-testid') || html.getAttribute('data-section');
      if (data) return `[${html.hasAttribute('data-testid') ? 'data-testid' : 'data-section'}="${CSS.escape(data)}"]`;
      const classes = [...html.classList].filter(Boolean).slice(0, 2).map((name) => `.${CSS.escape(name)}`).join('');
      return `${html.tagName.toLowerCase()}${classes}`;
    };
    const visible = (element: Element): boolean => {
      const html = element as HTMLElement;
      const style = getComputedStyle(html);
      const rect = html.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01 && rect.width > 0 && rect.height > 0;
    };
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter(visible)
      .slice(0, 120)
      .map((element) => ({ level: Number(element.tagName.slice(1)), text: clean(element.textContent, 500) }))
      .filter((item) => item.text);
    const ctas = [...document.querySelectorAll('a,button,[role="button"]')]
      .filter(visible)
      .slice(0, ctaLimit)
      .map((element) => ({ text: clean(element.textContent || element.getAttribute('aria-label'), 300), selector: selectorFor(element) }))
      .filter((item) => item.text);
    const candidates = [...document.querySelectorAll('main > section, main > article, body > section, [data-section], section, article')]
      .filter(visible)
      .filter((element, index, all) => all.indexOf(element) === index)
      .slice(0, sectionLimit);
    const sections = candidates.map((element) => {
      const html = element as HTMLElement;
      const rect = html.getBoundingClientRect();
      const style = getComputedStyle(html);
      const heading = element.querySelector('h1,h2,h3,h4,h5,h6');
      const localCtas = [...element.querySelectorAll('a,button,[role="button"]')].filter(visible).slice(0, 8);
      return {
        selector: selectorFor(element),
        tag: html.tagName.toLowerCase(),
        heading: clean(heading?.textContent, 500),
        visibleText: clean(html.innerText, 2400),
        ctas: localCtas.map((item) => clean(item.textContent || item.getAttribute('aria-label'), 250)).filter(Boolean),
        imageCount: element.querySelectorAll('img,picture,svg').length,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        backgroundColor: style.backgroundColor,
        color: style.color,
      };
    });
    return {
      visibleText: clean(document.body?.innerText, textLimit),
      headings,
      ctas,
      sections,
    };
  }, { textLimit: TEXT_LIMIT, sectionLimit: SECTION_LIMIT, ctaLimit: CTA_LIMIT });
}
