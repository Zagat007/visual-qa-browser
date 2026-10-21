import { describe, expect, it } from 'vitest';
import { loadViewportPreset } from '../audit-engine/browser/viewport-config';

describe('viewport config', () => {
  it('loads the 16-context full matrix through DEEP and appends configured breakpoint triads', async () => {
    const items = await loadViewportPreset(process.cwd(), 'DEEP');
    expect(items).toHaveLength(28);
    expect(items.find((item) => item.name === 'mobile-390')).toMatchObject({ width: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    expect(items.find((item) => item.name === 'mobile-844-landscape')).toMatchObject({ width: 844, height: 390, orientation: 'landscape', isMobile: true });
    expect(items.find((item) => item.name === 'desktop-1920')).toMatchObject({ width: 1920, height: 1080, isMobile: false });
    expect(items.filter((item) => item.name.startsWith('bp-768-')).map((item) => item.width)).toEqual([767, 768, 769]);
  });

  it('keeps QUICK and STANDARD bounded to their configured coverage', async () => {
    await expect(loadViewportPreset(process.cwd(), 'QUICK')).resolves.toHaveLength(2);
    await expect(loadViewportPreset(process.cwd(), 'STANDARD')).resolves.toHaveLength(6);
  });
});
