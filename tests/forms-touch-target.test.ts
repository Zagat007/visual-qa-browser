import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { collectFormEvidence } from '../audit-engine/forms/forms.js';

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
});

afterAll(async () => {
  await browser.close();
});

describe('form touch-target evidence', () => {
  it('uses an associated label as the effective checkbox/radio activation target', async () => {
    await page.setContent(`
      <style>
        label.choice { display:flex; align-items:center; min-height:44px; width:240px; }
        input[type=radio] { width:18px; height:18px; }
      </style>
      <label class="choice"><input id="plan" type="radio" name="plan"> Premium plan</label>
    `);
    const evidence = await collectFormEvidence(page);
    const field = evidence.fields.find((item) => item.selector === 'input#plan');
    expect(field).toBeDefined();
    expect(field?.touchTargetWidth).toBeLessThan(24);
    expect(field?.touchTargetSource).toBe('ASSOCIATED_LABEL');
    expect(field?.effectiveTouchTargetHeight).toBeGreaterThanOrEqual(44);
    expect(evidence.findings.some((finding) => finding.rule === 'small-control-target' && finding.selector === 'input#plan')).toBe(false);
  });

  it('still reports a genuinely tiny unlabeled activation surface', async () => {
    await page.setContent('<input id="tiny" type="checkbox" aria-label="Tiny" style="width:18px;height:18px">');
    const evidence = await collectFormEvidence(page);
    const finding = evidence.findings.find((item) => item.rule === 'small-control-target' && item.selector === 'input#tiny');
    expect(finding?.message).toContain('18×18');
  });

  it('does not count a non-clickable associated label as touch target area', async () => {
    await page.setContent('<input id="tiny-labeled" type="checkbox" aria-label="Tiny" style="width:18px;height:18px"><label for="tiny-labeled" style="display:block;width:160px;height:44px;pointer-events:none">Choice</label>');
    const evidence = await collectFormEvidence(page);
    const field = evidence.fields.find((item) => item.selector === 'input#tiny-labeled');
    expect(field?.touchTargetSource).toBe('CONTROL');
    expect(evidence.findings.some((item) => item.rule === 'small-control-target' && item.selector === 'input#tiny-labeled')).toBe(true);
  });
});
