import type { AuditConfiguration } from '../../../audit-engine/shared/types.js';

export interface AuditConfigurationInput {
  mode: AuditConfiguration['mode'];
  modules: AuditConfiguration['modules'];
  viewportPreset: AuditConfiguration['viewportPreset'];
  viewportNames?: string[] | undefined;
  customViewport?: AuditConfiguration['customViewport'] | undefined;
  powerMode: NonNullable<AuditConfiguration['powerMode']>;
  interactionDepth: NonNullable<AuditConfiguration['interactionDepth']>;
  artDirection?: AuditConfiguration['artDirection'] | undefined;
}

/**
 * Converts request-parser output into the strict internal configuration shape.
 * With exactOptionalPropertyTypes enabled, optional keys must be omitted rather
 * than present with an undefined value.
 */
export function normalizeAuditConfiguration(input: AuditConfigurationInput): AuditConfiguration {
  return {
    mode: input.mode,
    modules: [...input.modules],
    viewportPreset: input.viewportPreset,
    powerMode: input.powerMode,
    interactionDepth: input.interactionDepth,
    ...(input.artDirection !== undefined ? { artDirection: { ...input.artDirection, layers: [...input.artDirection.layers] } } : {}),
    ...(input.viewportNames !== undefined ? { viewportNames: [...input.viewportNames] } : {}),
    ...(input.customViewport !== undefined
      ? { customViewport: { width: input.customViewport.width, height: input.customViewport.height } }
      : {}),
  };
}
