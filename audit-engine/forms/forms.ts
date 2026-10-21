import type { Page } from 'playwright';
import type { FormEvidence } from '../shared/types.js';
import { redactUrl } from '../privacy/redaction.js';

interface RawFormEvidence extends Omit<FormEvidence, 'forms'> {
  forms: Array<{ selector: string; method: string; action: string; fieldCount: number; hasSubmitControl: boolean }>;
}

export async function collectFormEvidence(page: Page): Promise<FormEvidence> {
  const raw = await page.evaluate((): RawFormEvidence => {
    const escapeAttr = (value: string): string => value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

    const describe = (element: Element): string => {
      const html = element as HTMLElement;
      const tag = element.tagName.toLowerCase();
      if (html.id) return `${tag}#${CSS.escape(html.id)}`;
      const testId = element.getAttribute('data-testid');
      if (testId) return `${tag}[data-testid="${escapeAttr(testId)}"]`;
      const qa = element.getAttribute('data-qa');
      if (qa) return `${tag}[data-qa="${escapeAttr(qa)}"]`;
      const parent = element.parentElement;
      if (!parent) return tag;
      const siblings = Array.from(parent.children).filter((item) => item.tagName === element.tagName);
      const index = Math.max(0, siblings.indexOf(element)) + 1;
      return `${tag}:nth-of-type(${index})`;
    };

    const labelFor = (element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string => {
      const aria = element.getAttribute('aria-label')?.trim();
      if (aria) return aria.slice(0, 160);
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean).join(' ');
        if (text) return text.slice(0, 160);
      }
      if (element.id) {
        const explicit = document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim();
        if (explicit) return explicit.slice(0, 160);
      }
      const wrapping = element.closest('label')?.textContent?.trim();
      return (wrapping ?? '').replace(/\s+/g, ' ').slice(0, 160);
    };

    const allFieldElements = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea'))
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
    const fieldElements = allFieldElements.slice(0, 400);

    const fields: FormEvidence['fields'] = fieldElements.map((element) => {
      const rect = element.getBoundingClientRect();
      const type = element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase();
      const label = labelFor(element);
      const directRect = {
        x: Math.round((rect.x + window.scrollX) * 10) / 10,
        y: Math.round((rect.y + window.scrollY) * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
      };
      let effectiveRect = directRect;
      let touchTargetSource: FormEvidence['fields'][number]['touchTargetSource'] = 'CONTROL';
      // Native checkbox/radio labels are part of the actual activation surface.
      // Measuring only the tiny glyph creates false small-target findings even
      // when the visible row/tile is a correctly associated clickable <label>.
      if (element instanceof HTMLInputElement && (type === 'checkbox' || type === 'radio')) {
        const labels = Array.from(element.labels ?? []).filter((candidate) => {
          const candidateRect = candidate.getBoundingClientRect();
          let current: HTMLElement | null = candidate;
          while (current) {
            const style = getComputedStyle(current);
            if (
              current.hidden
              || current.hasAttribute('inert')
              || style.display === 'none'
              || style.visibility === 'hidden'
              || Number(style.opacity || '1') <= 0.01
              || style.pointerEvents === 'none'
            ) return false;
            current = current.parentElement;
          }
          return candidateRect.width > 0 && candidateRect.height > 0;
        });
        const largest = labels
          .map((candidate) => candidate.getBoundingClientRect())
          .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
        if (largest && (largest.width > rect.width || largest.height > rect.height)) {
          effectiveRect = {
            x: Math.round((largest.x + window.scrollX) * 10) / 10,
            y: Math.round((largest.y + window.scrollY) * 10) / 10,
            width: Math.round(largest.width * 10) / 10,
            height: Math.round(largest.height * 10) / 10,
          };
          touchTargetSource = 'ASSOCIATED_LABEL';
        }
      }
      const minLength = 'minLength' in element ? element.minLength : -1;
      const maxLength = 'maxLength' in element ? element.maxLength : -1;
      const pattern = element instanceof HTMLInputElement ? element.pattern : '';
      return {
        selector: describe(element),
        type,
        name: element.name,
        label,
        placeholder: element.getAttribute('placeholder') ?? '',
        required: element.required,
        autocomplete: element.getAttribute('autocomplete') ?? '',
        inputMode: element.getAttribute('inputmode') ?? '',
        minLength: minLength >= 0 ? minLength : null,
        maxLength: maxLength >= 0 ? maxLength : null,
        pattern,
        ariaInvalid: element.getAttribute('aria-invalid') ?? '',
        hasAccessibleName: Boolean(label || element.getAttribute('title')),
        touchTargetWidth: directRect.width,
        touchTargetHeight: directRect.height,
        effectiveTouchTargetWidth: effectiveRect.width,
        effectiveTouchTargetHeight: effectiveRect.height,
        touchTargetSource,
        rect: directRect,
        effectiveRect,
      };
    });

    const allForms = Array.from(document.forms);
    const forms = allForms.slice(0, 100).map((form) => ({
      selector: describe(form),
      method: (form.method || 'get').toUpperCase(),
      action: form.action,
      fieldCount: form.querySelectorAll('input,select,textarea').length,
      hasSubmitControl: Boolean(form.querySelector('button[type="submit"],input[type="submit"],button:not([type])')),
    }));

    const findings: FormEvidence['findings'] = [];
    for (const field of fields) {
      if (!field.hasAccessibleName && !['hidden', 'submit', 'button', 'reset', 'image'].includes(field.type)) {
        findings.push({ rule: 'missing-accessible-name', severity: 'P2', selector: field.selector, message: 'Visible form control has no detected label or accessible name.' });
      }
      if ((field.effectiveTouchTargetWidth < 24 || field.effectiveTouchTargetHeight < 24) && !['hidden'].includes(field.type)) {
        findings.push({
          rule: 'small-control-target', severity: 'P3', selector: field.selector,
          message: `Effective activation target is ${field.effectiveTouchTargetWidth}×${field.effectiveTouchTargetHeight}px (${field.touchTargetSource.toLowerCase()}); control box is ${field.touchTargetWidth}×${field.touchTargetHeight}px.`,
        });
      }
    }

    return {
      totalForms: allForms.length,
      totalFields: allFieldElements.length,
      formsTruncated: allForms.length > forms.length,
      fieldsTruncated: allFieldElements.length > fields.length,
      forms,
      fields,
      findings: findings.slice(0, 200),
    };
  });

  return {
    ...raw,
    forms: raw.forms.map((form) => ({ ...form, action: form.action ? redactUrl(form.action) : '' })),
  };
}
