import fs from 'node:fs/promises';
import path from 'node:path';
import type { AuditConfiguration, AuditPreset, CustomViewportInput, ViewportSpec } from '../shared/types.js';

interface RawConfig {
  version: number;
  viewports: Record<string, Omit<ViewportSpec, 'name'>>;
  presets: {
    QUICK: string[];
    STANDARD: string[];
    FULL_VIEWPORTS: string[];
  };
  breakpointBoundaries?: number[];
  breakpointHeight?: number;
}

const PRESET_KEY: Record<AuditPreset, keyof RawConfig['presets']> = {
  QUICK: 'QUICK',
  STANDARD: 'STANDARD',
  DEEP: 'FULL_VIEWPORTS',
};

function assertDimension(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 240 || value > 7680) throw new Error(`Invalid ${label}: ${value}`);
}

function assertViewport(viewport: ViewportSpec): void {
  if (!viewport.name || !/^[a-z0-9-]+$/.test(viewport.name)) throw new Error(`Invalid viewport name: ${viewport.name}`);
  assertDimension(viewport.width, `${viewport.name}.width`);
  assertDimension(viewport.height, `${viewport.name}.height`);
  if (!Number.isFinite(viewport.deviceScaleFactor) || viewport.deviceScaleFactor <= 0 || viewport.deviceScaleFactor > 4) {
    throw new Error(`Invalid ${viewport.name}.deviceScaleFactor`);
  }
  if (viewport.orientation !== 'portrait' && viewport.orientation !== 'landscape') throw new Error(`Invalid ${viewport.name}.orientation`);
}

function makeBreakpointTriads(raw: RawConfig): ViewportSpec[] {
  const boundaries = raw.breakpointBoundaries ?? [];
  const height = raw.breakpointHeight ?? 900;
  assertDimension(height, 'breakpointHeight');
  return boundaries.flatMap((boundary) => {
    assertDimension(boundary, `breakpoint ${boundary}`);
    return [-1, 0, 1].map((delta): ViewportSpec => ({
      name: `bp-${boundary}-${delta === -1 ? 'minus-1' : delta === 0 ? 'exact' : 'plus-1'}`,
      width: boundary + delta,
      height,
      deviceScaleFactor: 1,
      isMobile: boundary + delta < 768,
      hasTouch: boundary + delta < 1180,
      orientation: boundary + delta < height ? 'portrait' : 'landscape',
      heightSource: 'implementation-default',
    }));
  });
}

export async function loadViewportPreset(rootDir: string, preset: AuditPreset): Promise<ViewportSpec[]> {
  const raw = JSON.parse(await fs.readFile(path.join(rootDir, 'configs', 'viewport-matrix.json'), 'utf8')) as RawConfig;
  const names = raw.presets?.[PRESET_KEY[preset]];
  if (!Array.isArray(names) || names.length === 0) throw new Error(`Viewport preset ${preset} is empty or missing.`);
  const base = names.map((name): ViewportSpec => {
    const rawViewport = raw.viewports?.[name];
    if (!rawViewport) throw new Error(`Viewport ${name} referenced by ${preset} is missing.`);
    return { name, ...rawViewport };
  });
  const plan = preset === 'DEEP' ? [...base, ...makeBreakpointTriads(raw)] : base;
  const seen = new Set<string>();
  for (const viewport of plan) {
    assertViewport(viewport);
    if (seen.has(viewport.name)) throw new Error(`Duplicate viewport ${viewport.name} in preset ${preset}.`);
    seen.add(viewport.name);
  }
  return plan;
}

function customViewport(input: CustomViewportInput): ViewportSpec {
  assertDimension(input.width, 'custom.width');
  assertDimension(input.height, 'custom.height');
  const mobile = input.width < 768;
  return {
    name: `custom-${input.width}x${input.height}`,
    width: input.width,
    height: input.height,
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: input.width < 1180,
    orientation: input.width >= input.height ? 'landscape' : 'portrait',
    heightSource: 'implementation-default',
  };
}

export async function loadViewportPlan(rootDir: string, configuration: AuditConfiguration): Promise<ViewportSpec[]> {
  if (configuration.viewportPreset === 'CUSTOM') {
    if (!configuration.customViewport) throw new Error('Custom viewport dimensions are required.');
    return [customViewport(configuration.customViewport)];
  }

  if (configuration.viewportPreset === 'SELECTED') {
    const raw = JSON.parse(await fs.readFile(path.join(rootDir, 'configs', 'viewport-matrix.json'), 'utf8')) as RawConfig;
    const names = configuration.viewportNames ?? [];
    if (names.length === 0) throw new Error('At least one configured viewport must be selected.');
    if (names.length > 32) throw new Error('Too many selected viewports.');
    const uniqueNames = [...new Set(names)];
    if (uniqueNames.length !== names.length) throw new Error('Duplicate selected viewport names are not allowed.');
    return uniqueNames.map((name): ViewportSpec => {
      if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid viewport name: ${name}`);
      const rawViewport = raw.viewports?.[name];
      if (!rawViewport) throw new Error(`Unknown configured viewport: ${name}`);
      const viewport = { name, ...rawViewport };
      assertViewport(viewport);
      return viewport;
    });
  }

  return loadViewportPreset(rootDir, configuration.viewportPreset);
}
