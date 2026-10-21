import { describe, expect, it } from 'vitest';
import { normalizeAuditConfiguration } from '../app/backend/src/audit-configuration.js';

describe('audit configuration normalization', () => {
  it('omits unselected optional viewport fields instead of serializing undefined', () => {
    const configuration = normalizeAuditConfiguration({
      mode: 'FULL',
      modules: ['VISUAL', 'RUNTIME'],
      viewportPreset: 'STANDARD',
      viewportNames: undefined,
      customViewport: undefined,
      powerMode: 'NORMAL',
      interactionDepth: 'KEY',
    });

    expect('viewportNames' in configuration).toBe(false);
    expect('customViewport' in configuration).toBe(false);
  });

  it('preserves selected and custom viewport data when present', () => {
    const selected = normalizeAuditConfiguration({
      mode: 'VISUAL',
      modules: ['VISUAL'],
      viewportPreset: 'SELECTED',
      viewportNames: ['desktop-1440', 'mobile-390'],
      powerMode: 'FAST',
      interactionDepth: 'ALL',
    });
    expect(selected.viewportNames).toEqual(['desktop-1440', 'mobile-390']);

    const custom = normalizeAuditConfiguration({
      mode: 'VISUAL',
      modules: ['VISUAL'],
      viewportPreset: 'CUSTOM',
      customViewport: { width: 412, height: 915 },
      powerMode: 'ECO',
      interactionDepth: 'KEY',
    });
    expect(custom.customViewport).toEqual({ width: 412, height: 915 });
  });
  it('clones AI Art Director configuration without leaking mutable layer arrays', () => {
    const layers = ['PREMIUM_QUALITY', 'VISUAL_HIERARCHY'] as const;
    const configuration = normalizeAuditConfiguration({
      mode: 'FULL', modules: ['VISUAL'], viewportPreset: 'QUICK', powerMode: 'NORMAL', interactionDepth: 'KEY',
      artDirection: { enabled: true, provider: 'MANUAL', mode: 'STANDARD', layers: [...layers], privateEvidenceAllowed: false, siteProfile: 'GENERIC' },
    });
    expect(configuration.artDirection).toMatchObject({ enabled: true, provider: 'MANUAL', mode: 'STANDARD', siteProfile: 'GENERIC' });
    expect(configuration.artDirection?.layers).toEqual([...layers]);
    expect(configuration.artDirection?.layers).not.toBe(layers);
  });

});
