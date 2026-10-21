import { describe, expect, it } from 'vitest';
import { classifyInteractionCandidate, isDangerousInteractionSignal } from '../audit-engine/interactions/policy';

const base = {
  tag: 'button',
  role: '',
  type: 'button',
  text: '',
  href: '',
  disabled: false,
  ariaExpanded: '',
  ariaControls: '',
};

describe('interaction safety classifier', () => {
  it('recognizes consequential English actions', () => {
    for (const value of ['Pay now', 'Delete account', 'Checkout', 'Upload file', 'Submit order']) {
      expect(isDangerousInteractionSignal(value)).toBe(true);
    }
  });

  it('recognizes consequential Russian actions without ASCII word-boundary dependence', () => {
    for (const value of ['Оплатить сейчас', 'Купить', 'Заказать песню', 'Удалить', 'Отправить форму', 'Подтвердить', 'Загрузить файл']) {
      expect(isDangerousInteractionSignal(value)).toBe(true);
    }
  });

  it('does not classify ordinary local UI labels as dangerous', () => {
    for (const value of ['Открыть FAQ', 'Следующий слайд', 'Details', 'Tab 2']) {
      expect(isDangerousInteractionSignal(value)).toBe(false);
    }
  });

  it('keeps navigation focus-only and allows explicit local disclosures', () => {
    expect(classifyInteractionCandidate({ ...base, tag: 'a', href: 'https://example.com/', text: 'Details' }).classification).toBe('FOCUS_ONLY');
    expect(classifyInteractionCandidate({ ...base, ariaExpanded: 'false', ariaControls: 'faq-panel', text: 'FAQ' }).classification).toBe('SAFE_STATE');
    expect(classifyInteractionCandidate({ ...base, type: 'submit', text: 'Continue' }).classification).toBe('SKIPPED_SAFELY');
  });
});
