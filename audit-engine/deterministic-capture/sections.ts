import fs from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import type { SectionScreenshot } from '../shared/types.js';

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';
}

export async function captureMajorSections(page: Page, outputDir: string, viewportName: string): Promise<SectionScreenshot[]> {
  const sectionDir = path.join(outputDir, 'sections');
  await fs.mkdir(sectionDir, { recursive: true });
  const candidates: Array<{ selector: string; name: string }> = [
    { selector: 'header', name: 'header' },
    { selector: 'main > section', name: 'main-section' },
    { selector: 'footer', name: 'footer' },
  ];
  const results: SectionScreenshot[] = [];

  for (const candidate of candidates) {
    const locator = page.locator(candidate.selector);
    const count = Math.min(await locator.count(), candidate.selector === 'main > section' ? 24 : 2);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      try {
        if (!(await item.isVisible())) continue;
        const box = await item.boundingBox();
        if (!box || box.width < 40 || box.height < 30) continue;
        const name = `${candidate.name}-${String(index + 1).padStart(2, '0')}`;
        const filename = `${slug(viewportName)}__${slug(name)}.png`;
        const screenshotPath = path.join(sectionDir, filename);
        await item.screenshot({ path: screenshotPath, animations: 'disabled' });
        const selector = count > 1 || candidate.selector === 'main > section'
          ? `${candidate.selector}:nth-of-type(${index + 1})`
          : candidate.selector;
        results.push({ name, selector, screenshotPath });
      } catch {
        // Section evidence is best-effort; full-page capture remains the primary evidence.
      }
    }
  }
  return results;
}
