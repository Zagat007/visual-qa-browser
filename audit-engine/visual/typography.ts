import type { Page } from 'playwright';
import type { TypographyEvidence } from '../shared/types.js';

export async function collectTypographyEvidence(page: Page): Promise<TypographyEvidence> {
  return page.evaluate(() => {
    const describe = (element: Element): string => {
      const html = element as HTMLElement;
      const tag = element.tagName.toLowerCase();
      if (html.id) return `${tag}#${CSS.escape(html.id)}`;
      const testId = element.getAttribute('data-testid');
      if (testId) return `${tag}[data-testid="${CSS.escape(testId)}"]`;
      const qa = element.getAttribute('data-qa');
      if (qa) return `${tag}[data-qa="${CSS.escape(qa)}"]`;
      const classes = [...element.classList].slice(0, 2).map((value) => CSS.escape(value));
      if (classes.length) return `${tag}.${classes.join('.')}`;
      const parent = element.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter((item) => item.tagName === element.tagName);
      return `${tag}:nth-of-type(${Math.max(0, siblings.indexOf(element)) + 1})`;
    };
    const roles: Array<{ role: string; selector: string }> = [
      { role: 'H1', selector: 'h1' },
      { role: 'H2', selector: 'h2' },
      { role: 'H3', selector: 'h3' },
      { role: 'EYEBROW', selector: '[class*="eyebrow" i],[class*="kicker" i],[class*="overline" i],[data-typography-role="eyebrow"]' },
      { role: 'SUBTITLE', selector: '[class*="subtitle" i],[class*="sub-title" i],[data-typography-role="subtitle"]' },
      { role: 'BODY', selector: 'p,main li' },
      { role: 'SMALL_TEXT', selector: 'small,[class*="small" i]' },
      { role: 'BUTTON', selector: 'button,[role="button"],a[class*="button" i],a[class*="btn" i]' },
      { role: 'FORM_LABEL', selector: 'label' },
      { role: 'PRICE', selector: '[class*="price" i],[data-price],[data-typography-role="price"]' },
      { role: 'OLD_PRICE', selector: 'del,s,[class*="old-price" i],[class*="price-old" i],[data-typography-role="old-price"]' },
      { role: 'MICROCOPY', selector: '[class*="micro" i],[class*="caption" i],[class*="hint" i],[class*="note" i],[data-typography-role="microcopy"]' },
    ];
    const groups: TypographyEvidence['groups'] = [];
    for (const definition of roles) {
      const elements = Array.from(document.querySelectorAll(definition.selector)).filter((element) => {
        const style = getComputedStyle(element as HTMLElement);
        const rect = (element as HTMLElement).getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01 && rect.width > 0 && rect.height > 0;
      }).slice(0, 300);
      const variants = new Map<string, TypographyEvidence['groups'][number]['variants'][number]>();
      for (const element of elements) {
        const style = getComputedStyle(element as HTMLElement);
        const variant = {
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          textTransform: style.textTransform,
          textAlign: style.textAlign,
          count: 1,
          sampleSelectors: [describe(element)],
        };
        // Alignment is layout/composition, not a distinct typography token. Keeping it
        // in the identity key produced false "role variants" for otherwise identical
        // headings that were left/center aligned in different sections.
        const key = JSON.stringify({
          fontFamily: variant.fontFamily,
          fontSize: variant.fontSize,
          fontWeight: variant.fontWeight,
          lineHeight: variant.lineHeight,
          letterSpacing: variant.letterSpacing,
          textTransform: variant.textTransform,
        });
        const existing = variants.get(key);
        if (existing) {
          existing.count += 1;
          if (existing.sampleSelectors.length < 6) existing.sampleSelectors.push(describe(element));
        }
        else variants.set(key, variant);
      }
      groups.push({ role: definition.role, count: elements.length, variants: [...variants.values()].sort((a, b) => b.count - a.count).slice(0, 30) });
    }
    return { groups };
  });
}
