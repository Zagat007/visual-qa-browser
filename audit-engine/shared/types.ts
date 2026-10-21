export type AuditStatus = 'QUEUED' | 'RUNNING' | 'PASS' | 'ISSUE' | 'PARTIAL' | 'FAILED' | 'NOT_VERIFIED' | 'CANCELLED';
export type AuditPreset = 'QUICK' | 'STANDARD' | 'DEEP';
export type AuditViewportPreset = AuditPreset | 'SELECTED' | 'CUSTOM';
export type AuditMode = 'FULL' | 'VISUAL' | 'RESPONSIVE' | 'FORMS' | 'INTERACTIONS' | 'RUNTIME' | 'ACCESSIBILITY' | 'SEO' | 'SECURITY' | 'PERFORMANCE' | 'CUSTOM';
export type AuditModule = 'VISUAL' | 'RESPONSIVE' | 'FORMS' | 'INTERACTIONS' | 'RUNTIME' | 'ACCESSIBILITY' | 'SEO' | 'SECURITY' | 'PERFORMANCE';
export type AuditPowerMode = 'ECO' | 'NORMAL' | 'FAST' | 'MAX';
export type InteractionDepth = 'KEY' | 'ALL';
export type ArtDirectionMode = 'ECONOMY' | 'STANDARD' | 'DEEP';
export type ArtDirectionProvider = 'MANUAL' | 'OPENAI';
export type ArtDirectionLayer =
  | 'PREMIUM_QUALITY' | 'IMAGE_QUALITY_VARIETY' | 'SEMANTIC_IMAGE_FIT' | 'VISUAL_HIERARCHY'
  | 'TYPOGRAPHY_SPACING' | 'EMOTIONAL_FIT' | 'CONVERSION' | 'CROSS_SECTION' | 'CROSS_PAGE'
  | 'MOBILE' | 'DESKTOP';
export type ArtDirectionPriority = 'STRONGLY_RECOMMENDED' | 'SHOULD_CONSIDER' | 'OPTIONAL_POLISH';
export type ArtDirectionCategory = 'ART_DIRECTION' | 'IMAGE_RELEVANCE' | 'IMAGE_VARIETY' | 'VISUAL_MONOTONY' | 'PREMIUM_QUALITY' | 'TYPOGRAPHY' | 'COMPOSITION' | 'SPACING' | 'HIERARCHY' | 'EMOTIONAL_FIT' | 'CONVERSION' | 'CONSISTENCY' | 'CONTENT_DENSITY' | 'VISUAL_STORYTELLING';

export interface ArtDirectionConfiguration {
  enabled: boolean;
  provider: ArtDirectionProvider;
  mode: ArtDirectionMode;
  layers: ArtDirectionLayer[];
  privateEvidenceAllowed: boolean;
  siteProfile: 'AUTO' | 'MELODY4YOU' | 'GENERIC';
}
export type SubsystemStatus = 'PASS' | 'ISSUE' | 'FAILED' | 'PARTIAL' | 'NOT_VERIFIED' | 'SKIPPED_SAFELY';
export type Orientation = 'portrait' | 'landscape';

export interface CustomViewportInput {
  width: number;
  height: number;
}

export interface AuditConfiguration {
  mode: AuditMode;
  modules: AuditModule[];
  viewportPreset: AuditViewportPreset;
  viewportNames?: string[];
  customViewport?: CustomViewportInput;
  powerMode?: AuditPowerMode;
  interactionDepth?: InteractionDepth;
  artDirection?: ArtDirectionConfiguration;
}

export interface HardwareProfile {
  logicalCpus: number;
  totalMemoryGb: number;
  freeMemoryGb: number;
  safeWorkerCapacity: number;
  recommendedPowerMode: AuditPowerMode;
}

export interface AuditExecutionEvidence {
  requestedPowerMode: AuditPowerMode;
  viewportWorkers: number;
  interactionWorkers: number;
  interactionDepth: InteractionDepth;
  hardware: HardwareProfile;
}

export interface ViewportSpec {
  name: string;
  width: number;
  height: number;
  heightSource?: 'implementation-default';
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  orientation: Orientation;
}

export interface RuntimeConsoleEntry {
  type: string;
  text: string;
  location?: { url: string; lineNumber: number; columnNumber: number };
}

export type RuntimeNetworkKind =
  | 'response'
  | 'redirect'
  | 'http-error'
  | 'asset-error'
  | 'request-failed'
  | 'benign-abort'
  | 'mixed-content'
  | 'skipped-safely'
  | 'blocked-private-network'
  | 'policy-blocked'
  | 'request-validation-failed'
  | 'websocket-blocked';

export interface RuntimeNetworkEntry {
  kind: RuntimeNetworkKind;
  method: string;
  url: string;
  status?: number;
  reason?: string;
  resourceType?: string;
  durationMs?: number;
  sizeBytes?: number;
  frameUrl?: string;
  redirectTo?: string;
}

export interface StabilizationEvidence {
  fontsReady: boolean;
  imagesReady: boolean;
  imageCount: number;
  brokenImageCount: number;
  lazyLoadWarmup: boolean;
  networkIdleObserved: boolean;
  layoutStable: boolean;
  animationsControlled: boolean;
}

export interface SectionScreenshot {
  name: string;
  selector: string;
  screenshotPath: string;
}

export type FindingSeverity = 'P0' | 'P1' | 'P2' | 'P3';
export type FindingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RectEvidence { x: number; y: number; width: number; height: number; }

export interface GeometryFinding {
  rule: 'horizontal-overflow' | 'viewport-horizontal-escape' | 'zero-size-interactive' | 'fixed-obstruction' | 'clipping-candidate' | 'overlap-candidate';
  severity: FindingSeverity;
  confidence: FindingConfidence;
  message: string;
  selector?: string;
  relatedSelector?: string;
  rect?: RectEvidence;
  relatedRect?: RectEvidence;
}

export interface GeometryEvidence {
  viewportWidth: number;
  viewportHeight: number;
  documentScrollWidth: number;
  documentScrollHeight: number;
  horizontalOverflowPx: number;
  elementsScanned: number;
  elementsTruncated: boolean;
  overlapPairsScanned: number;
  findings: GeometryFinding[];
  stickyFixed: Array<{ selector: string; position: 'fixed' | 'sticky'; zIndex: string; areaRatio: number; rect: RectEvidence }>;
  stackingContexts: Array<{ selector: string; position: string; zIndex: string; transform: string; opacity: number }>;
  sectionGaps: Array<{ from: string; to: string; gapPx: number }>;
}

export interface TypographyVariant {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textTransform: string;
  textAlign: string;
  count: number;
  sampleSelectors: string[];
}

export interface TypographyGroup { role: string; count: number; variants: TypographyVariant[]; }
export interface TypographyEvidence { groups: TypographyGroup[]; }

export interface ImageMetric {
  selector: string;
  rect: RectEvidence;
  src: string;
  currentSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  intrinsicAspectRatio: number | null;
  renderedAspectRatio: number | null;
  aspectRatioDeltaPct: number | null;
  objectFit: string;
  objectPosition: string;
  loading: string;
  complete: boolean;
  broken: boolean;
  cropCandidate: boolean;
}

export interface ImageEvidence {
  totalImages: number;
  sampledImages: number;
  truncated: boolean;
  brokenImages: number;
  cropCandidates: number;
  duplicateUrlGroups: Array<{ url: string; count: number }>;
  metrics: ImageMetric[];
}

export interface AccessibilityViolation {
  id: string;
  impact: string | null;
  tags: string[];
  help: string;
  helpUrl: string;
  nodes: Array<{ target: string[]; failureSummary: string }>;
}

export interface AccessibilityEvidence {
  auditStatus: SubsystemStatus;
  error?: string;
  engine: 'axe-core';
  version: string;
  automatedOnly: true;
  violationCount: number;
  incompleteCount: number;
  passCount: number;
  inapplicableCount: number;
  violations: AccessibilityViolation[];
  incomplete: Array<{ id: string; impact: string | null; help: string; nodeCount: number }>;
}

export type SeoFindingRule = 'missing-title' | 'missing-description' | 'missing-h1' | 'multiple-h1' | 'missing-lang' | 'missing-viewport-meta' | 'heading-order-jump';
export interface SeoFinding { rule: SeoFindingRule; severity: FindingSeverity; message: string; }
export interface SeoEvidence {
  auditStatus: SubsystemStatus;
  error?: string;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  viewport: string;
  lang: string;
  openGraph: { title: string; description: string; image: string; url: string; type: string };
  twitter: { card: string; title: string; description: string; image: string };
  h1Count: number;
  headings: Array<{ level: number; text: string }>;
  headingJumps: Array<{ from: number; to: number; index: number }>;
  noindex: boolean;
  findings: SeoFinding[];
}

export type DeliveryFindingRule = 'no-main-response' | 'not-https' | 'missing-hsts' | 'missing-csp' | 'missing-nosniff' | 'missing-referrer-policy' | 'cookie-missing-secure' | 'cookie-missing-httponly' | 'cookie-missing-samesite';
export interface DeliveryFinding { rule: DeliveryFindingRule; severity: FindingSeverity; message: string; }
export interface DeliveryEvidence {
  auditStatus: SubsystemStatus;
  error?: string;
  finalUrl: string;
  status: number | null;
  headers: Record<string, string>;
  setCookieCount: number;
  cookieFlagSummary: { missingSecure: number; missingHttpOnly: number; missingSameSite: number };
  findings: DeliveryFinding[];
}

export type Soft404Verdict = 'REAL_404' | 'SOFT_404' | 'SPA_FALLBACK' | 'NOT_VERIFIED';
export interface SiteTechnicalEvidence {
  homeStatus: number | null;
  robots: { url: string; status: number | null; contentType: string; sample: string };
  sitemap: { url: string; status: number | null; contentType: string; sample: string };
  soft404: { url: string; status: number | null; title: string; canonical: string; robots: string; bodySimilarity: number; verdict: Soft404Verdict };
  runtime: {
    console: RuntimeConsoleEntry[];
    pageErrors: string[];
    network: RuntimeNetworkEntry[];
    limits: { consoleDropped: number; pageErrorsDropped: number; networkDropped: number; textTruncated?: number };
  };
}

export type FormFindingRule = 'missing-accessible-name' | 'small-control-target';

export interface FormFinding {
  rule: FormFindingRule;
  severity: FindingSeverity;
  selector: string;
  message: string;
}

export interface FormFieldEvidence {
  selector: string;
  type: string;
  name: string;
  label: string;
  placeholder: string;
  required: boolean;
  autocomplete: string;
  inputMode: string;
  minLength: number | null;
  maxLength: number | null;
  pattern: string;
  ariaInvalid: string;
  hasAccessibleName: boolean;
  touchTargetWidth: number;
  touchTargetHeight: number;
  effectiveTouchTargetWidth: number;
  effectiveTouchTargetHeight: number;
  touchTargetSource: 'CONTROL' | 'ASSOCIATED_LABEL';
  rect: RectEvidence;
  effectiveRect: RectEvidence;
}

export interface FormEvidence {
  totalForms: number;
  totalFields: number;
  formsTruncated: boolean;
  fieldsTruncated: boolean;
  forms: Array<{ selector: string; method: string; action: string; fieldCount: number; hasSubmitControl: boolean }>;
  fields: FormFieldEvidence[];
  findings: FormFinding[];
}

export type InteractionClassification = 'SAFE_STATE' | 'FOCUS_ONLY' | 'SKIPPED_SAFELY';

export interface InteractionCandidate {
  selector: string;
  kind: string;
  label: string;
  classification: InteractionClassification;
  reason: string;
  hoverTested: boolean;
  focusTested: boolean;
  activationTested: boolean;
  stateChanged: boolean;
  screenshotPath?: string;
  error?: string;
}

export interface InteractionAuditEvidence {
  viewport: ViewportSpec;
  pageUrl: string;
  discovered: number;
  sampledCandidates: number;
  discoveryTruncated: boolean;
  activationLimitReached: boolean;
  testedHover: number;
  testedFocus: number;
  testedActivation: number;
  skippedSafely: number;
  failed: number;
  candidates: InteractionCandidate[];
  forms: FormEvidence;
  runtime: {
    console: RuntimeConsoleEntry[];
    pageErrors: string[];
    network: RuntimeNetworkEntry[];
    limits: { consoleDropped: number; pageErrorsDropped: number; networkDropped: number; textTruncated?: number };
  };
}


export interface ArtSectionContext {
  selector: string;
  tag: string;
  heading: string;
  visibleText: string;
  ctas: string[];
  imageCount: number;
  rect: RectEvidence;
  backgroundColor: string;
  color: string;
}

export interface ArtContextEvidence {
  visibleText: string;
  headings: Array<{ level: number; text: string }>;
  ctas: Array<{ text: string; selector: string }>;
  sections: ArtSectionContext[];
}

export interface ArtDirectionFinding {
  artId: string;
  rootCauseKey: string;
  rootCauseId: string;
  page: string;
  section: string;
  viewport: string;
  category: ArtDirectionCategory;
  score: number;
  confidence: FindingConfidence;
  priority: ArtDirectionPriority;
  observation: string;
  evidence: string[];
  impact: string;
  recommendation: string;
  implementationHint: string;
  expectedImprovement: string;
  alternatives: Array<{ label: string; description: string; recommended: boolean }>;
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED' | 'IGNORED' | 'SAVED_FOR_LATER';
}

export interface ArtDirectionSectionScore {
  page: string;
  section: string;
  viewport: string;
  score: number;
  confidence: FindingConfidence;
}

export interface ArtDirectionRootCause {
  id: string;
  key: string;
  title: string;
  findingIds: string[];
}

export interface ArtDirectionReview {
  enabled: true;
  status: 'PASS' | 'ISSUE' | 'NOT_CONFIGURED' | 'FAILED' | 'PARTIAL';
  provider: ArtDirectionProvider;
  providerModel: string | null;
  mode: ArtDirectionMode;
  advisoryOnly: true;
  externalAnalysis: boolean;
  overallScore: number | null;
  subscores: Record<'visualHierarchy' | 'typography' | 'spacingRhythm' | 'imageQuality' | 'imageSemanticFit' | 'imageVariety' | 'composition' | 'brandConsistency' | 'premiumPerception' | 'conversionPresentation', number | null>;
  sectionScores: ArtDirectionSectionScore[];
  findings: ArtDirectionFinding[];
  rootCauses: ArtDirectionRootCause[];
  evidencePackagePath: string;
  manualPromptPath: string;
  imageReviewBoardPath: string;
  error?: string;
  limitations: string[];
}

export interface DeviceContextEvidence {
  userAgent: string;
  devicePixelRatio: number;
  orientationType: string;
  orientationAngle: number;
  pointerFine: boolean;
  pointerCoarse: boolean;
  hoverCapable: boolean;
  anyHoverCapable: boolean;
}

export interface CaptureEvidence {
  viewport: ViewportSpec;
  deviceContext: DeviceContextEvidence;
  screenshotPath: string;
  screenshotBytes: number;
  captureAttempts: number;
  capturedAt: string;
  sectionScreenshots: SectionScreenshot[];
  title: string;
  finalUrl: string;
  httpStatus: number | null;
  documentSize: { width: number; height: number };
  stabilization: StabilizationEvidence;
  geometry: GeometryEvidence;
  typography: TypographyEvidence;
  images: ImageEvidence;
  accessibility: AccessibilityEvidence;
  seo: SeoEvidence;
  delivery: DeliveryEvidence;
  runtime: {
    console: RuntimeConsoleEntry[];
    pageErrors: string[];
    network: RuntimeNetworkEntry[];
    limits: { consoleDropped: number; pageErrorsDropped: number; networkDropped: number; textTruncated?: number };
  };
  artContext: ArtContextEvidence;
}

export interface CaptureFailure {
  viewport: ViewportSpec;
  error: string;
}

export interface ResponsiveSample {
  width: number;
  documentWidth: number;
  documentHeight: number;
  horizontalOverflowPx: number;
  mainWidth: number;
  h1MaxLines: number;
  h2MaxLines: number;
}

export interface ResponsiveFinding {
  rule: 'responsive-overflow' | 'heading-line-jump' | 'document-height-jump' | 'container-width-jump';
  confidence: FindingConfidence;
  fromWidth: number;
  toWidth: number;
  message: string;
  verification?: {
    status: 'CONFIRMED' | 'NOT_REPRODUCED' | 'NOT_VERIFIED';
    width: number;
    measuredOverflowPx: number | null;
    screenshotPath?: string;
    capturedAt?: string;
    finalUrl?: string;
    reason?: string;
  };
}

export interface ResponsiveEvidence {
  start: number;
  end: number;
  step: number;
  height: number;
  widthOnly: true;
  samples: ResponsiveSample[];
  findings: ResponsiveFinding[];
  unstableWidths: number[];
  policyBlockedRequests: number;
  validationFailedRequests: number;
}

export type PerformanceRunStatus = 'PASS' | 'FAILED' | 'NOT_VERIFIED';
export type PerformanceSanityStatus = 'PASS' | 'SUSPECT';

export interface PerformanceMetricSet {
  performanceScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  fcpMs: number | null;
  ttfbMs: number | null;
  speedIndexMs: number | null;
  totalBlockingTimeMs: number | null;
}

export interface PerformanceRunEvidence {
  run: number;
  status: PerformanceRunStatus;
  startedAt: string;
  finishedAt: string;
  finalUrl: string;
  lighthouseVersion: string;
  chromeVersion: string;
  cacheState: 'COLD_FRESH_PROFILE';
  formFactor: 'desktop';
  metrics: PerformanceMetricSet;
  resources: {
    requestCount: number | null;
    transferBytes: number | null;
  };
  sanity: {
    status: PerformanceSanityStatus;
    reasons: string[];
    elapsedMs: number;
  };
  safety: {
    safeMode: true;
    allowedMethods: string[];
    blockedMutationRequests: number;
    blockedPolicyRequests: number;
    blockedWebSockets: number;
    serviceWorkerBypassPages: number;
    serviceWorkerBypassErrors: string[];
    safetyInterference: boolean;
    guardVerified: boolean;
  };
  reportPath?: string;
  measurementPath?: string;
  error?: string;
}

export interface PerformanceEvidence {
  auditStatus: SubsystemStatus;
  labMeasurement: true;
  methodology: 'LIGHTHOUSE_DESKTOP_COLD_3_MEDIAN';
  profile: {
    config: 'lighthouse:desktopConfig';
    throttlingMethod: string;
    throttling: Record<string, number | string | boolean | null>;
    screenEmulation: Record<string, number | string | boolean | null>;
  };
  requestedRuns: 3;
  completedRuns: number;
  validRuns: number;
  validForVerdict: boolean;
  measurementSanity: {
    status: PerformanceSanityStatus;
    suspectRuns: number[];
    reasons: string[];
  };
  nodeVersion: string;
  targetUrl: string;
  median: PerformanceMetricSet;
  medianResources: {
    requestCount: number | null;
    transferBytes: number | null;
  };
  runs: PerformanceRunEvidence[];
  limitations: string[];
}

export interface AuditCoverage {
  fullPassEligible: boolean;
  incompleteReasons: string[];
  truncatedEvidenceSources: string[];
  requestedViewports: number;
  completedViewports: number;
  failedViewports: number;
  sectionScreenshots: number;
  skippedSafelyRequests: number;
  policyBlockedRequests: number;
  validationFailedRequests: number;
  responsiveSweepSamples: number;
  interactionViewports: number;
  interactionCandidates: number;
  interactionsTested: number;
  interactionsSkippedSafely: number;
  formFieldsInspected: number;
}

export interface AuditMetadata {
  appVersion: string;
  sourceTreeHash: string;
  sourceFileCount: number;
  configHash: string;
  packageLockHash: string | null;
  gitCommit: string | null;
  gitDirty: boolean | null;
  browserVersion: string;
  nodeVersion: string;
  os: {
    platform: string;
    release: string;
    arch: string;
  };
}

export interface AuditResult {
  jobId: string;
  requestedUrl: string;
  preset: AuditViewportPreset;
  configuration: AuditConfiguration;
  startedAt: string;
  finishedAt: string;
  status: AuditStatus;
  safeMode: true;
  metadata: AuditMetadata;
  coverage: AuditCoverage;
  captures: CaptureEvidence[];
  captureFailures: CaptureFailure[];
  responsiveSweep: ResponsiveEvidence | null;
  responsiveSweepFailure: string | null;
  interactionAudits: InteractionAuditEvidence[];
  interactionFailures: Array<{ viewport: ViewportSpec; error: string }>;
  siteTechnical: SiteTechnicalEvidence | null;
  siteTechnicalFailure: string | null;
  performance?: PerformanceEvidence | null;
  performanceFailure?: string | null;
  artDirection?: ArtDirectionReview | null;
  execution?: AuditExecutionEvidence;
  reportRelativePath: string;
  reportAbsolutePath: string;
  notes: string[];
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
