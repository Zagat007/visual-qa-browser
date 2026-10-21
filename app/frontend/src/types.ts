export type AuditStatus = 'QUEUED' | 'RUNNING' | 'PASS' | 'ISSUE' | 'PARTIAL' | 'FAILED' | 'NOT_VERIFIED' | 'CANCELLED';
export type AuditPreset = 'QUICK' | 'STANDARD' | 'DEEP';
export type AuditViewportPreset = AuditPreset | 'SELECTED' | 'CUSTOM';
export type AuditMode = 'FULL' | 'VISUAL' | 'RESPONSIVE' | 'FORMS' | 'INTERACTIONS' | 'RUNTIME' | 'ACCESSIBILITY' | 'SEO' | 'SECURITY' | 'PERFORMANCE' | 'CUSTOM';
export type AuditModule = 'VISUAL' | 'RESPONSIVE' | 'FORMS' | 'INTERACTIONS' | 'RUNTIME' | 'ACCESSIBILITY' | 'SEO' | 'SECURITY' | 'PERFORMANCE';
export type AuditPowerMode = 'ECO' | 'NORMAL' | 'FAST' | 'MAX';
export type InteractionDepth = 'KEY' | 'ALL';
export type ArtDirectionMode = 'ECONOMY' | 'STANDARD' | 'DEEP';
export type ArtDirectionProvider = 'MANUAL' | 'OPENAI';
export type ArtDirectionLayer = 'PREMIUM_QUALITY' | 'IMAGE_QUALITY_VARIETY' | 'SEMANTIC_IMAGE_FIT' | 'VISUAL_HIERARCHY' | 'TYPOGRAPHY_SPACING' | 'EMOTIONAL_FIT' | 'CONVERSION' | 'CROSS_SECTION' | 'CROSS_PAGE' | 'MOBILE' | 'DESKTOP';

export interface ArtDirectionConfiguration {
  enabled: boolean;
  provider: ArtDirectionProvider;
  mode: ArtDirectionMode;
  layers: ArtDirectionLayer[];
  privateEvidenceAllowed: boolean;
  siteProfile: 'AUTO' | 'MELODY4YOU' | 'GENERIC';
}

export interface AuditConfiguration {
  mode: AuditMode;
  modules: AuditModule[];
  viewportPreset: AuditViewportPreset;
  viewportNames?: string[];
  customViewport?: { width: number; height: number };
  powerMode?: AuditPowerMode;
  interactionDepth?: InteractionDepth;
  artDirection?: ArtDirectionConfiguration;
}

export interface AuditJob {
  id: string;
  url: string;
  preset: AuditViewportPreset;
  configuration: AuditConfiguration;
  status: AuditStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  currentStage?: string;
  completedCaptures?: number;
  totalCaptures?: number;
  progressPercent?: number;
  completedSteps?: number;
  totalSteps?: number;
  remainingSteps?: number;
  currentViewport?: string;
  currentSubsystem?: string;
  error?: string;
  reportUrl?: string;
  gptPromptUrl?: string;
  gptEvidenceUrl?: string;
  premiumGptPromptUrl?: string;
  artDirectionUrl?: string;
  artEvidenceUrl?: string;
  artImageBoardUrl?: string;
  artManualPromptUrl?: string;
}

export interface VisualBaseline {
  id: string;
  auditId: string;
  url: string;
  createdAt: string;
  platform: string;
  browserVersion: string;
  captures: Array<{ name: string; width: number; height: number; sha256: string }>;
}
export interface VisualComparison {
  id: string;
  baselineId: string;
  auditId: string;
  status: 'REVIEW' | 'UNCHANGED' | 'NOT_COMPARABLE';
  items: Array<{ viewport: string; status: 'REVIEW' | 'UNCHANGED' | 'NOT_COMPARABLE'; reason?: string; ratio?: number; differentPixels?: number; baselineUrl?: string; currentUrl?: string; diffUrl?: string }>;
  note: string;
}
export type ScenarioAction = 'assertVisible' | 'assertText' | 'click' | 'check' | 'fill';
export interface ScenarioStepInput { action: ScenarioAction; selector: string; value: string; }
export interface ScenarioResult {
  id: string;
  status: 'PASS' | 'ISSUE' | 'PARTIAL' | 'NOT_VERIFIED';
  steps: Array<{ number: number; action: ScenarioAction; selector: string; status: 'PASS' | 'ISSUE' | 'SKIPPED_SAFELY' | 'NOT_VERIFIED'; message: string; screenshotUrl?: string }>;
  traceUrl?: string;
  note: string;
}


export interface ViewportCapability {
  name: string;
  width: number;
  height: number;
  orientation: string;
}

export interface HardwareProfile {
  logicalCpus: number;
  totalMemoryGb: number;
  freeMemoryGb: number;
  safeWorkerCapacity: number;
  recommendedPowerMode: AuditPowerMode;
}

export interface AuditCapabilities {
  language: string;
  safeMode: boolean;
  modules: AuditModule[];
  unsupported: string[];
  viewports: ViewportCapability[];
  hardware?: HardwareProfile;
  powerModes?: AuditPowerMode[];
  artDirector?: { providers: Array<{ id: ArtDirectionProvider; configured: boolean; model: string | null }> };
  fixBridge?: FixBridgeCapabilities;
}

export interface FixBridgeCapabilities {
  defaultProjectRoot: string | null;
  schemaVersion: number;
}

export interface WorkspaceInspection {
  ok: true;
  projectName: string;
  fileCount: number;
  totalBytes: number;
  fingerprint: string;
  skippedSensitive: number;
  skippedLarge: number;
  skippedUnsupported: number;
  warnings: string[];
}

export interface FixVerificationCommand {
  script: string;
  command: string;
  status: 'PASS' | 'FAILED' | 'NOT_AVAILABLE' | 'TIMEOUT';
  exitCode: number | null;
  output: string;
}

export interface FixVerificationResult {
  status: 'PASS' | 'FAILED' | 'NOT_CONFIGURED' | 'NOT_VERIFIED';
  packageManager: string | null;
  commands: FixVerificationCommand[];
  note: string;
}

export interface AppliedFixResult {
  fixId: string;
  backupId: string;
  appliedFiles: string[];
  verification: FixVerificationResult;
  warnings: string[];
}

export interface FixBackupSummary {
  backupId: string;
  fixId: string;
  createdAt: string;
  rolledBackAt?: string;
  fileCount: number;
}

export interface FixBackupList {
  backups: FixBackupSummary[];
  warnings: string[];
}
