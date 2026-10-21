import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactElement } from 'react';
import { useAuditJob } from './useAuditJob';
import {
  ALL_MODULES, ART_DIRECTION_LAYERS, ART_DIRECTION_MODES, INTERACTION_DEPTHS, MODE_DEFINITIONS, MODULE_LABELS, POWER_MODES, STATUS_RU, VIEWPORT_PRESETS,
  stageLabel, subsystemLabel,
} from './audit-ui';
import { ART_HELP, HELP } from './help';
import type {
  AppliedFixResult, ArtDirectionLayer, ArtDirectionMode, ArtDirectionProvider, AuditCapabilities, AuditJob, AuditMode, AuditModule, AuditPowerMode, AuditViewportPreset, FixBackupList, FixBackupSummary, InteractionDepth, ScenarioAction, ScenarioResult, ScenarioStepInput, ViewportCapability, VisualBaseline, VisualComparison, WorkspaceInspection,
} from './types';

const TERMINAL = new Set(['PASS', 'ISSUE', 'PARTIAL', 'FAILED', 'NOT_VERIFIED', 'CANCELLED']);
const DEFAULT_SELECTED = ['desktop-1440', 'mobile-390'];
const FALLBACK_VIEWPORTS: ViewportCapability[] = [
  { name: 'desktop-1920', width: 1920, height: 1080, orientation: 'landscape' },
  { name: 'desktop-1600', width: 1600, height: 900, orientation: 'landscape' },
  { name: 'desktop-1440', width: 1440, height: 900, orientation: 'landscape' },
  { name: 'desktop-1366', width: 1366, height: 768, orientation: 'landscape' },
  { name: 'desktop-1280', width: 1280, height: 800, orientation: 'landscape' },
  { name: 'tablet-1180', width: 1180, height: 820, orientation: 'landscape' },
  { name: 'tablet-1024', width: 1024, height: 768, orientation: 'landscape' },
  { name: 'tablet-834', width: 834, height: 1194, orientation: 'portrait' },
  { name: 'tablet-768', width: 768, height: 1024, orientation: 'portrait' },
  { name: 'mobile-430', width: 430, height: 932, orientation: 'portrait' },
  { name: 'mobile-414', width: 414, height: 896, orientation: 'portrait' },
  { name: 'mobile-390', width: 390, height: 844, orientation: 'portrait' },
  { name: 'mobile-375', width: 375, height: 812, orientation: 'portrait' },
  { name: 'mobile-360', width: 360, height: 800, orientation: 'portrait' },
  { name: 'mobile-320', width: 320, height: 568, orientation: 'portrait' },
  { name: 'mobile-844-landscape', width: 844, height: 390, orientation: 'landscape' },
];

function InfoTip({ text, label = 'Подробнее' }: { text: string; label?: string }): ReactElement {
  return (
    <span className="infoTip">
      <button type="button" className="infoButton" aria-label={label}>i</button>
      <span className="infoBubble" role="tooltip">{text}</span>
    </span>
  );
}

interface SelectableCardProps {
  active: boolean;
  badge: string;
  title: string;
  english: string;
  description: string;
  help: string;
  value: string;
  onSelect: (value: string) => void;
}

function SelectableCard({ active, badge, title, english, description, help, value, onSelect }: SelectableCardProps): ReactElement {
  const handleSelect = useCallback(() => onSelect(value), [onSelect, value]);
  return (
    <article className={`choiceCard${active ? ' choiceCard-active' : ''}`}>
      <button type="button" className="choiceSelect" aria-pressed={active} onClick={handleSelect}>
        <span className="choiceTop"><span className="choiceBadge">{badge}</span><span className="choiceMark" aria-hidden="true">{active ? '●' : '○'}</span></span>
        <strong>{title}</strong><span className="choiceEnglish">{english}</span><span className="choiceDescription">{description}</span>
      </button>
      <InfoTip text={help} label={`Что означает «${title}»`} />
    </article>
  );
}

function ModuleToggle({ module, checked, onToggle }: { module: AuditModule; checked: boolean; onToggle: (module: AuditModule) => void }): ReactElement {
  const meta = MODULE_LABELS[module];
  const handleToggle = useCallback(() => onToggle(module), [module, onToggle]);
  return (
    <article className={`moduleToggle${checked ? ' moduleToggle-active' : ''}`}>
      <button type="button" className="moduleSelect" aria-pressed={checked} onClick={handleToggle}>
        <span className="moduleCheck" aria-hidden="true">{checked ? '✓' : '+'}</span>
        <span><strong>{meta.title}</strong><small>{meta.english} · {meta.hint}</small></span>
      </button>
      <InfoTip text={meta.help} label={`Справка: ${meta.title}`} />
    </article>
  );
}

function ViewportToggle({ viewport, checked, onToggle }: { viewport: ViewportCapability; checked: boolean; onToggle: (name: string) => void }): ReactElement {
  const handleToggle = useCallback(() => onToggle(viewport.name), [onToggle, viewport.name]);
  const family = viewport.name.startsWith('desktop') ? 'Desktop' : viewport.name.startsWith('tablet') ? 'Tablet' : 'Mobile';
  return (
    <button type="button" className={`viewportToggle${checked ? ' viewportToggle-active' : ''}`} aria-pressed={checked} onClick={handleToggle}>
      <span className="viewportFamily">{family}</span><strong>{viewport.width} × {viewport.height}</strong>
      <small>{viewport.orientation === 'portrait' ? 'Портрет' : 'Альбом'}</small>
    </button>
  );
}

function ArtLayerToggle({ layer, title, hint, checked, onToggle }: { layer: ArtDirectionLayer; title: string; hint: string; checked: boolean; onToggle: (layer: ArtDirectionLayer) => void }): ReactElement {
  const handleToggle = useCallback(() => onToggle(layer), [layer, onToggle]);
  return <article className={`artLayerCard${checked ? ' artLayerCard-active' : ''}`}><button type="button" className="artLayerToggle" aria-pressed={checked} onClick={handleToggle}><span>{checked ? '✓' : '+'}</span><strong>{title}</strong><small>{hint}</small></button><InfoTip text={hint} label={`Справка: ${title}`} /></article>;
}

interface QuickWorkflowCardProps {
  badge: string;
  title: string;
  description: string;
  meta: string;
  help: string;
  tone: 'daily' | 'recheck' | 'visual' | 'maximum';
  primary?: boolean;
  onClick: () => void;
}

function QuickWorkflowCard({ badge, title, description, meta, help, tone, primary = false, onClick }: QuickWorkflowCardProps): ReactElement {
  return (
    <article className={`quickWorkflowCard quickTone-${tone}${primary ? ' quickWorkflowCard-primary' : ''}`}>
      <button className="quickWorkflow" type="button" onClick={onClick}>
        <span className="quickWorkflowTop"><span className="quickBadge">{badge}</span><span className="quickApply">ПРИМЕНИТЬ →</span></span>
        <strong>{title}</strong>
        <small>{description}</small>
        <em>{meta}</em>
      </button>
      <InfoTip text={help} label={`Когда использовать «${title}»`} />
    </article>
  );
}


function comparisonStatusLabel(status: VisualComparison['status'] | VisualComparison['items'][number]['status']): string {
  return status === 'UNCHANGED' ? 'Без изменений' : status === 'REVIEW' ? 'Нужен просмотр' : 'Нельзя сравнить';
}

function scenarioStatusLabel(status: ScenarioResult['status']): string {
  return status === 'PASS' ? 'Сценарий пройден' : status === 'ISSUE' ? 'Найдена проблема' : status === 'PARTIAL' ? 'Проверено частично' : 'Не подтверждено';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; } catch { /* use legacy fallback below */ }
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Clipboard copy is unavailable');
}

const PROJECT_ROOT_STORAGE_KEY = 'vqb-project-root';

function loadStoredProjectRoot(): string {
  try { return window.localStorage.getItem(PROJECT_ROOT_STORAGE_KEY) ?? ''; } catch { return ''; }
}

function rememberProjectRoot(value: string): void {
  try {
    if (value.trim()) window.localStorage.setItem(PROJECT_ROOT_STORAGE_KEY, value);
    else window.localStorage.removeItem(PROJECT_ROOT_STORAGE_KEY);
  } catch { /* persistence is a convenience, not a requirement */ }
}

function bytesLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? fallback;
  } catch { return fallback; }
}

async function downloadResponse(response: Response, fallbackName: string): Promise<void> {
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const name = match?.[1] ?? fallbackName;
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}

export function App(): ReactElement {
  const [url, setUrl] = useState('https://example.com');
  const [mode, setMode] = useState<AuditMode>('FULL');
  const [modules, setModules] = useState<AuditModule[]>(ALL_MODULES);
  const [viewportPreset, setViewportPreset] = useState<AuditViewportPreset>('STANDARD');
  const [selectedViewportNames, setSelectedViewportNames] = useState<string[]>(DEFAULT_SELECTED);
  const [customWidth, setCustomWidth] = useState(390);
  const [customHeight, setCustomHeight] = useState(844);
  const [powerMode, setPowerMode] = useState<AuditPowerMode>('NORMAL');
  const [interactionDepth, setInteractionDepth] = useState<InteractionDepth>('KEY');
  const [artEnabled, setArtEnabled] = useState(false);
  const [artProvider, setArtProvider] = useState<ArtDirectionProvider>('MANUAL');
  const [artMode, setArtMode] = useState<ArtDirectionMode>('STANDARD');
  const [artLayers, setArtLayers] = useState<ArtDirectionLayer[]>(ART_DIRECTION_LAYERS.map((item) => item[0] as ArtDirectionLayer));
  const [artProfile, setArtProfile] = useState<'AUTO' | 'MELODY4YOU' | 'GENERIC'>('AUTO');
  const [capabilities, setCapabilities] = useState<AuditCapabilities | null>(null);
  const [capabilitiesWarning, setCapabilitiesWarning] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState<AuditJob[]>([]);
  const [copyStatus, setCopyStatus] = useState('');
  const [cancelStatus, setCancelStatus] = useState('');
  const [projectRoot, setProjectRoot] = useState(loadStoredProjectRoot);
  const [workspaceInspection, setWorkspaceInspection] = useState<WorkspaceInspection | null>(null);
  const [fixBridgeStatus, setFixBridgeStatus] = useState('');
  const [fixBridgeBusy, setFixBridgeBusy] = useState(false);
  const [selectedFixPackage, setSelectedFixPackage] = useState<File | null>(null);
  const [appliedFix, setAppliedFix] = useState<AppliedFixResult | null>(null);
  const [fixBackups, setFixBackups] = useState<FixBackupSummary[]>([]);
  const [fixBackupWarnings, setFixBackupWarnings] = useState<string[]>([]);
  const [baselines, setBaselines] = useState<VisualBaseline[]>([]);
  const [baselineId, setBaselineId] = useState('');
  const [comparison, setComparison] = useState<VisualComparison | null>(null);
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualStatus, setVisualStatus] = useState('');
  const [scenarioName, setScenarioName] = useState('Проверка основного сценария');
  const [scenarioWidth, setScenarioWidth] = useState(390);
  const [scenarioHeight, setScenarioHeight] = useState(844);
  const [scenarioSteps, setScenarioSteps] = useState<ScenarioStepInput[]>([{ action: 'assertVisible', selector: 'h1', value: '' }]);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [scenarioStatus, setScenarioStatus] = useState('');
  const job = useAuditJob(jobId);

  const refreshHistory = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/audits');
      if (!response.ok) return;
      setHistory((await response.json() as AuditJob[]).slice(0, 8));
    } catch { /* history is non-critical */ }
  }, []);

  const refreshFixBackups = useCallback(async (root: string, signal?: AbortSignal): Promise<void> => {
    if (!root.trim()) { setFixBackups([]); setFixBackupWarnings([]); return; }
    try {
      const response = await fetch('/api/fixes/backups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectRoot: root }), signal: signal ?? null });
      if (!response.ok) { setFixBackups([]); return; }
      const result = await response.json() as FixBackupList;
      setFixBackups(result.backups);
      setFixBackupWarnings(result.warnings);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      /* recovery list is non-critical until rollback is requested */
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetch('/api/capabilities').then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<AuditCapabilities>;
    }).then((value) => {
      if (!active) return;
      setCapabilities(value);
      if (value.hardware?.recommendedPowerMode) setPowerMode(value.hardware.recommendedPowerMode);
      if (value.fixBridge?.defaultProjectRoot) {
        setProjectRoot((current) => {
          if (current.trim()) return current;
          rememberProjectRoot(value.fixBridge?.defaultProjectRoot ?? '');
          return value.fixBridge?.defaultProjectRoot ?? '';
        });
      }
    }).catch(() => {
      if (active) setCapabilitiesWarning('Не удалось получить возможности backend. Используются безопасные значения по умолчанию.');
    });
    void refreshHistory();
    return () => { active = false; };
  }, [refreshHistory]);

  useEffect(() => {
    if (!job || TERMINAL.has(job.status)) void refreshHistory();
  }, [job?.status, refreshHistory]);

  useEffect(() => {
    if (!projectRoot.trim()) { setFixBackups([]); setFixBackupWarnings([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void refreshFixBackups(projectRoot, controller.signal); }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [projectRoot, refreshFixBackups]);

  const viewports = capabilities?.viewports?.length ? capabilities.viewports : FALLBACK_VIEWPORTS;
  const isRunning = job ? !TERMINAL.has(job.status) : false;
  const latestRollbackBackup = useMemo(() => fixBackups.find((backup) => !backup.rolledBackAt) ?? null, [fixBackups]);

  const refreshBaselines = useCallback(async (targetUrl: string) => {
    const response = await fetch('/api/visual-baselines/list', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: targetUrl }),
    });
    if (!response.ok) throw new Error(await responseError(response, 'Не удалось прочитать эталоны.'));
    const list = await response.json() as VisualBaseline[];
    setBaselines(list);
    setBaselineId((current) => list.some((item) => item.id === current) ? current : (list[0]?.id ?? ''));
  }, []);
  useEffect(() => {
    if (!job?.reportUrl) { setBaselines([]); setComparison(null); return; }
    let active = true;
    void fetch('/api/visual-baselines/list', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: job.url }),
    }).then(async (response) => {
      if (!response.ok) throw new Error('Baseline list unavailable.');
      return response.json() as Promise<VisualBaseline[]>;
    }).then((list) => {
      if (!active) return;
      setBaselines(list);
      setBaselineId((current) => list.some((item) => item.id === current) ? current : (list[0]?.id ?? ''));
    }).catch(() => { if (active) setVisualStatus('Список эталонов недоступен.'); });
    return () => { active = false; };
  }, [job?.id, job?.reportUrl, job?.url]);
  const selectedMode = useMemo(() => MODE_DEFINITIONS.find((item) => item.id === mode) ?? MODE_DEFINITIONS[0], [mode]);
  const selectedPreset = useMemo(() => VIEWPORT_PRESETS.find((item) => item.id === viewportPreset) ?? VIEWPORT_PRESETS[1], [viewportPreset]);
  const jobModeTitle = useMemo(() => MODE_DEFINITIONS.find((item) => item.id === job?.configuration.mode)?.title ?? job?.configuration.mode ?? '—', [job?.configuration.mode]);
  const progressPercent = useMemo(() => Math.max(0, Math.min(100, job?.progressPercent ?? 0)), [job?.progressPercent]);
  const hardware = capabilities?.hardware;
  const artProviders = capabilities?.artDirector?.providers ?? [{ id: 'MANUAL' as const, configured: true, model: null }];
  const openAiProvider = artProviders.find((item) => item.id === 'OPENAI');
  const viewportSummary = useMemo(() => {
    if (viewportPreset === 'QUICK') return '2 ключевых';
    if (viewportPreset === 'STANDARD') return '6 основных';
    if (viewportPreset === 'DEEP') return 'Полная матрица + triads';
    if (viewportPreset === 'SELECTED') return `${selectedViewportNames.length} выбранных`;
    return `${customWidth} × ${customHeight}`;
  }, [customHeight, customWidth, selectedViewportNames.length, viewportPreset]);
  const estimatedLoad = useMemo(() => {
    const base = powerMode === 'ECO' ? 'Низкая' : powerMode === 'NORMAL' ? 'Средняя' : powerMode === 'FAST' ? 'Высокая' : 'Максимальная';
    const requestedWorkers = powerMode === 'ECO' ? 1 : powerMode === 'NORMAL' ? 2 : powerMode === 'FAST' ? 4 : 6;
    const workers = Math.min(requestedWorkers, hardware?.safeWorkerCapacity ?? requestedWorkers);
    return `${base} · до ${workers} workers${workers < requestedWorkers ? ' (ограничено железом)' : ''}`;
  }, [hardware?.safeWorkerCapacity, powerMode]);
  const statusText = useMemo(() => job ? `${STATUS_RU[job.status] ?? job.status} · ${stageLabel(job.currentStage)}` : 'Готов к запуску', [job]);
  const cancelBusy = cancelStatus === 'Останавливаю…' || job?.currentStage === 'cancelling';

  const handleModeSelect = useCallback((value: string) => {
    const nextMode = value as AuditMode;
    setMode(nextMode);
    const definition = MODE_DEFINITIONS.find((item) => item.id === nextMode);
    if (definition && nextMode !== 'CUSTOM') setModules(definition.modules);
  }, []);
  const handleModuleToggle = useCallback((module: AuditModule) => {
    setMode('CUSTOM');
    setModules((current) => current.includes(module) ? current.filter((item) => item !== module) : [...current, module]);
  }, []);
  const handleViewportToggle = useCallback((name: string) => {
    setSelectedViewportNames((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  }, []);

  const configurationError = useMemo(() => {
    if (modules.length === 0) return 'Выберите хотя бы один модуль проверки.';
    if (viewportPreset === 'SELECTED' && selectedViewportNames.length === 0) return 'Выберите хотя бы одно разрешение.';
    if (viewportPreset === 'CUSTOM' && (!Number.isInteger(customWidth) || !Number.isInteger(customHeight) || customWidth < 240 || customWidth > 7680 || customHeight < 240 || customHeight > 7680)) return 'Своё разрешение: 240–7680 px по каждой стороне.';
    if (artEnabled && !modules.includes('VISUAL')) return 'AI Art Director требует модуль «Визуал» для screenshot/evidence.';
    if (artEnabled && artLayers.length === 0) return 'AI Art Director: выберите хотя бы один слой анализа.';
    if (artEnabled && artProvider === 'OPENAI' && !openAiProvider?.configured) return 'OpenAI provider не настроен: задайте OPENAI_API_KEY и OPENAI_ART_DIRECTOR_MODEL или выберите Manual/ChatGPT export.';
    return '';
  }, [artEnabled, artLayers.length, artProvider, customHeight, customWidth, modules, openAiProvider?.configured, selectedViewportNames.length, viewportPreset]);

  const applyWorkflow = useCallback((workflow: 'DAILY' | 'MAX_LIVE' | 'VISUAL' | 'RECHECK') => {
    if (workflow === 'DAILY') {
      setMode('CUSTOM'); setModules(ALL_MODULES.filter((item) => item !== 'PERFORMANCE')); setViewportPreset('STANDARD'); setPowerMode(capabilities?.hardware?.recommendedPowerMode ?? 'NORMAL'); setInteractionDepth('KEY');
    } else if (workflow === 'MAX_LIVE') {
      setMode('FULL'); setModules(ALL_MODULES); setViewportPreset('DEEP'); setPowerMode(capabilities?.hardware?.recommendedPowerMode === 'ECO' ? 'NORMAL' : (capabilities?.hardware?.recommendedPowerMode ?? 'FAST')); setInteractionDepth('ALL');
    } else if (workflow === 'VISUAL') {
      setMode('RESPONSIVE'); setModules(['VISUAL', 'RESPONSIVE']); setViewportPreset('DEEP'); setPowerMode('FAST'); setInteractionDepth('KEY');
    } else {
      setMode('RESPONSIVE'); setModules(['VISUAL', 'RESPONSIVE', 'RUNTIME']); setViewportPreset('QUICK'); setPowerMode('FAST'); setInteractionDepth('KEY');
    }
  }, [capabilities?.hardware?.recommendedPowerMode]);

  const handleArtLayerToggle = useCallback((layer: ArtDirectionLayer) => {
    setArtLayers((current) => current.includes(layer) ? current.filter((item) => item !== layer) : [...current, layer]);
  }, []);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (configurationError) { setSubmitError(configurationError); return; }
    setSubmitting(true); setSubmitError(''); setCopyStatus(''); setCancelStatus('');
    try {
      const configuration = {
        mode, modules, viewportPreset, powerMode, interactionDepth,
        ...(viewportPreset === 'SELECTED' ? { viewportNames: selectedViewportNames } : {}),
        ...(viewportPreset === 'CUSTOM' ? { customViewport: { width: customWidth, height: customHeight } } : {}),
        ...(artEnabled ? { artDirection: { enabled: true, provider: artProvider, mode: artMode, layers: artLayers, privateEvidenceAllowed: false, siteProfile: artProfile } } : {}),
      };
      const response = await fetch('/api/audits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, configuration }) });
      const body = await response.json() as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? `HTTP ${response.status}`);
      setJobId(body.id);
      await refreshHistory();
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Не удалось запустить аудит.'); }
    finally { setSubmitting(false); }
  }, [artEnabled, artLayers, artMode, artProfile, artProvider, configurationError, customHeight, customWidth, interactionDepth, mode, modules, powerMode, refreshHistory, selectedViewportNames, url, viewportPreset]);

  const handleCancel = useCallback(async () => {
    if (!jobId || !isRunning) return;
    setCancelStatus('Останавливаю…');
    const endpoint = `/api/audits/${encodeURIComponent(jobId)}/cancel`;
    const sendCancel = async (): Promise<Response> => fetch(endpoint, { method: 'POST', signal: AbortSignal.timeout(4_000) });
    try {
      let response: Response;
      try {
        response = await sendCancel();
      } catch {
        // One bounded retry covers a transient control-plane hiccup without
        // leaving the user guessing whether the button actually worked.
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        response = await sendCancel();
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setCancelStatus('Остановка подтверждена. Завершаю безопасную остановку…');
    } catch {
      setCancelStatus('Backend не ответил на остановку. Используйте STOP.bat только если приложение остаётся недоступно.');
    }
  }, [isRunning, jobId]);

  const handleCopyGpt = useCallback(async () => {
    if (!job?.gptPromptUrl) return;
    setCopyStatus('Копирую…');
    try {
      const response = await fetch(job.gptPromptUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      await copyText(text);
      setCopyStatus('Запрос скопирован. Приложите ZIP с доказательствами и исходники сайта для правки.');
    } catch { setCopyStatus('Не удалось скопировать автоматически. Откройте отчёт и используйте кнопку внутри.'); }
  }, [job?.gptPromptUrl]);

  const handleCopyPremiumGpt = useCallback(async () => {
    if (!job?.premiumGptPromptUrl) return;
    setCopyStatus('Копирую premium-задание…');
    try {
      const response = await fetch(job.premiumGptPromptUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await copyText(await response.text());
      setCopyStatus('Technical + Art скопированы. Приложите ZIP со скриншотами и исходники сайта.');
    } catch { setCopyStatus('Не удалось скопировать premium-задание автоматически.'); }
  }, [job?.premiumGptPromptUrl]);

  const handleProjectRootChange = useCallback((value: string) => {
    setProjectRoot(value);
    rememberProjectRoot(value);
    setWorkspaceInspection(null);
    setSelectedFixPackage(null);
    setAppliedFix(null);
    setFixBackups([]);
    setFixBackupWarnings([]);
    setFixBridgeStatus('');
  }, []);

  const handleInspectWorkspace = useCallback(async () => {
    if (!projectRoot.trim()) { setFixBridgeStatus('Укажите папку локального проекта.'); return; }
    setFixBridgeBusy(true); setFixBridgeStatus('Проверяю папку проекта…');
    try {
      const response = await fetch('/api/workspace/inspect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectRoot }) });
      if (!response.ok) throw new Error(await responseError(response, `HTTP ${response.status}`));
      const inspection = await response.json() as WorkspaceInspection;
      setWorkspaceInspection(inspection);
      await refreshFixBackups(projectRoot);
      setFixBridgeStatus(`Проект найден: ${inspection.projectName} · ${inspection.fileCount} source-файлов · ${bytesLabel(inspection.totalBytes)}.`);
    } catch (error) { setWorkspaceInspection(null); setFixBridgeStatus(error instanceof Error ? error.message : 'Не удалось проверить проект.'); }
    finally { setFixBridgeBusy(false); }
  }, [projectRoot, refreshFixBackups]);

  const handleCreateFixPack = useCallback(async () => {
    if (!job?.id || !job.reportUrl) { setFixBridgeStatus('Сначала завершите аудит.'); return; }
    if (!projectRoot.trim()) { setFixBridgeStatus('Укажите папку локального проекта.'); return; }
    setFixBridgeBusy(true); setFixBridgeStatus('Собираю единый Fix Pack: evidence + безопасные исходники…');
    try {
      const response = await fetch(`/api/audits/${encodeURIComponent(job.id)}/fix-pack`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectRoot }) });
      if (!response.ok) throw new Error(await responseError(response, `HTTP ${response.status}`));
      await downloadResponse(response, 'VQB-CHATGPT-FIX-PACK.zip');
      setFixBridgeStatus('Fix Pack собран. Прикрепите ОДИН этот ZIP в чат со мной и напишите «го».');
    } catch (error) { setFixBridgeStatus(error instanceof Error ? error.message : 'Не удалось собрать Fix Pack.'); }
    finally { setFixBridgeBusy(false); }
  }, [job?.id, job?.reportUrl, projectRoot]);

  const handleFixPackageSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFixPackage(file);
    setAppliedFix(null);
    setFixBridgeStatus(file ? `Выбран пакет: ${file.name}. Перед записью будут проверены manifest и SHA-256.` : '');
  }, []);

  const handleApplyFixPackage = useCallback(async () => {
    if (!selectedFixPackage) { setFixBridgeStatus('Выберите ZIP с исправлениями, который я вернул.'); return; }
    if (!projectRoot.trim()) { setFixBridgeStatus('Укажите папку локального проекта.'); return; }
    setFixBridgeBusy(true); setFixBridgeStatus('Проверяю пакет и неисполняющий precheck. Запись начнётся только после успешного precheck…');
    try {
      const response = await fetch(`/api/fixes/apply?projectRoot=${encodeURIComponent(projectRoot)}`, { method: 'POST', headers: { 'content-type': 'application/zip' }, body: selectedFixPackage });
      if (!response.ok) throw new Error(await responseError(response, `HTTP ${response.status}`));
      const result = await response.json() as AppliedFixResult;
      setAppliedFix(result);
      await refreshFixBackups(projectRoot);
      const verification = result.verification.status === 'PASS'
        ? 'Non-executing precheck PASS.'
        : result.verification.note;
      const warningText = result.warnings.length ? ` Предупреждений записи: ${result.warnings.length}.` : '';
      setFixBridgeStatus(`Применено файлов: ${result.appliedFiles.length}. ${verification}${warningText}`);
    } catch (error) { setAppliedFix(null); setFixBridgeStatus(error instanceof Error ? error.message : 'Не удалось применить Fix Package.'); }
    finally { setFixBridgeBusy(false); }
  }, [projectRoot, refreshFixBackups, selectedFixPackage]);

  const handleRollbackFix = useCallback(async () => {
    const backupId = appliedFix?.backupId ?? latestRollbackBackup?.backupId;
    if (!backupId) { setFixBridgeStatus('Доступный backup для rollback не найден.'); return; }
    setFixBridgeBusy(true); setFixBridgeStatus('Проверяю целостность backup и откатываю файлы…');
    try {
      const response = await fetch('/api/fixes/rollback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectRoot, backupId }) });
      if (!response.ok) throw new Error(await responseError(response, `HTTP ${response.status}`));
      const result = await response.json() as { restoredFiles: string[]; warnings: string[] };
      setAppliedFix(null);
      await refreshFixBackups(projectRoot);
      setFixBridgeStatus(`Rollback подтверждён хэшами. Восстановлено файлов: ${result.restoredFiles.length}${result.warnings.length ? ` · предупреждений: ${result.warnings.length}` : ''}.`);
    } catch (error) { setFixBridgeStatus(error instanceof Error ? error.message : 'Rollback не выполнен.'); }
    finally { setFixBridgeBusy(false); }
  }, [appliedFix, latestRollbackBackup, projectRoot, refreshFixBackups]);

  const handlePostDeployRecheck = useCallback(async () => {
    if (!job || job.url.includes('[REDACTED]')) { setFixBridgeStatus('Исходный URL недоступен для автоматического re-check.'); return; }
    setFixBridgeBusy(true); setFixBridgeStatus('Запускаю повторный live-аудит с теми же настройками…');
    try {
      const response = await fetch('/api/audits', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: job.url, configuration: job.configuration }) });
      const body = await response.json() as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? `HTTP ${response.status}`);
      setJobId(body.id);
      setFixBridgeStatus('Re-check запущен. Он проверяет LIVE-сайт, поэтому нажимайте после загрузки исправлений на хостинг.');
    } catch (error) { setFixBridgeStatus(error instanceof Error ? error.message : 'Не удалось запустить re-check.'); }
    finally { setFixBridgeBusy(false); }
  }, [job]);

  const repeatSettings = useCallback((item: AuditJob) => {
    setMode(item.configuration.mode); setModules(item.configuration.modules); setViewportPreset(item.configuration.viewportPreset);
    setPowerMode(item.configuration.powerMode ?? 'NORMAL'); setInteractionDepth(item.configuration.interactionDepth ?? 'KEY');
    setSelectedViewportNames(item.configuration.viewportNames ?? DEFAULT_SELECTED);
    if (item.configuration.customViewport) { setCustomWidth(item.configuration.customViewport.width); setCustomHeight(item.configuration.customViewport.height); }
    const art = item.configuration.artDirection; setArtEnabled(Boolean(art?.enabled)); if (art) { setArtProvider(art.provider); setArtMode(art.mode); setArtLayers(art.layers); setArtProfile(art.siteProfile); }
    if (!item.url.includes('[REDACTED]')) setUrl(item.url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const approveBaseline = useCallback(async () => {
    if (!job?.id) return;
    setVisualBusy(true); setVisualStatus('Сохраняю утверждённый эталон…');
    try {
      const response = await fetch('/api/visual-baselines/approve', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auditId: job.id }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Не удалось сохранить эталон.'));
      const created = await response.json() as VisualBaseline;
      await refreshBaselines(job.url);
      setBaselineId(created.id);
      setComparison(null);
      setVisualStatus(`Эталон сохранён: ${created.captures.length} снимков. Он не меняется автоматически.`);
    } catch (error) { setVisualStatus(error instanceof Error ? error.message : 'Ошибка сохранения эталона.'); }
    finally { setVisualBusy(false); }
  }, [job?.id, job?.url, refreshBaselines]);

  const compareBaseline = useCallback(async () => {
    if (!job?.id || !baselineId) return;
    setVisualBusy(true); setVisualStatus('Сравниваю снимки в локальном Chromium…'); setComparison(null);
    try {
      const response = await fetch('/api/visual-baselines/compare', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auditId: job.id, baselineId }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Сравнение не выполнено.'));
      const result = await response.json() as VisualComparison;
      setComparison(result);
      setVisualStatus(result.status === 'REVIEW' ? 'Обнаружены различия — проверьте их глазами.'
        : result.status === 'UNCHANGED' ? 'Значимых пиксельных различий в сопоставимых снимках не обнаружено.'
          : 'Часть снимков несопоставима; общего визуального PASS нет.');
    } catch (error) { setVisualStatus(error instanceof Error ? error.message : 'Сравнение не выполнено.'); }
    finally { setVisualBusy(false); }
  }, [baselineId, job?.id]);

  const updateScenarioStep = useCallback((index: number, patch: Partial<ScenarioStepInput>) => {
    setScenarioSteps((current) => current.map((step, at) => at === index ? { ...step, ...patch } : step));
  }, []);
  const exportScenario = useCallback(() => {
    const specification = { schemaVersion: 1, name: scenarioName, url, viewport: { width: scenarioWidth, height: scenarioHeight }, steps: scenarioSteps };
    const objectUrl = window.URL.createObjectURL(new Blob([JSON.stringify(specification, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `vqb-scenario-${scenarioName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) || 'custom'}.json`;
    anchor.click();
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1_000);
  }, [scenarioHeight, scenarioName, scenarioSteps, scenarioWidth, url]);
  const importScenario = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (file.size > 16_384) throw new Error('Сценарий слишком большой.');
      const value = JSON.parse(await file.text()) as Record<string, unknown>;
      const viewport = value.viewport as { width?: unknown; height?: unknown } | null;
      if (value.schemaVersion !== 1 || typeof value.name !== 'string' || value.name.length > 80 ||
        typeof value.url !== 'string' || !viewport || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) ||
        Number(viewport.width) < 240 || Number(viewport.width) > 1920 || Number(viewport.height) < 240 || Number(viewport.height) > 1200 ||
        !Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 12 ||
        !value.steps.every((item: unknown) => {
          if (!item || typeof item !== 'object') return false;
          const step = item as ScenarioStepInput;
          const needsValue = step.action === 'assertText' || step.action === 'fill';
          return ['assertVisible', 'assertText', 'click', 'check', 'fill'].includes(step.action) &&
            typeof step.selector === 'string' && step.selector.trim().length >= 1 && step.selector.length <= 300 &&
            typeof step.value === 'string' && step.value.length <= 120 && (!needsValue || step.value.trim().length >= 1);
        })) throw new Error('Формат сценария неверен.');
      setScenarioName(value.name); setUrl(value.url); setScenarioWidth(Number(viewport.width)); setScenarioHeight(Number(viewport.height));
      setScenarioSteps(value.steps as ScenarioStepInput[]);
      setScenarioResult(null); setScenarioStatus('Сценарий загружен. Проверьте URL и шаги перед запуском.');
    } catch (error) { setScenarioStatus(error instanceof Error ? error.message : 'Не удалось открыть сценарий.'); }
  }, []);
  const runScenario = useCallback(async () => {
    setScenarioBusy(true); setScenarioStatus('Выполняю безопасные шаги…'); setScenarioResult(null);
    try {
      const steps = scenarioSteps.map((step) => ({
        action: step.action, selector: step.selector.trim(),
        ...(step.action === 'fill' ? { value: step.value } : {}),
        ...(step.action === 'assertText' ? { expected: step.value } : {}),
      }));
      const response = await fetch('/api/scenarios/run', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: scenarioName, url, viewport: { width: scenarioWidth, height: scenarioHeight }, steps }),
      });
      if (!response.ok) throw new Error(await responseError(response, 'Сценарий не выполнен.'));
      const result = await response.json() as ScenarioResult;
      setScenarioResult(result);
      setScenarioStatus(`Сценарий: ${result.status}. Выполнено шагов: ${result.steps.length}/${scenarioSteps.length}.`);
    } catch (error) { setScenarioStatus(error instanceof Error ? error.message : 'Сценарий не выполнен.'); }
    finally { setScenarioBusy(false); }
  }, [scenarioHeight, scenarioName, scenarioSteps, scenarioWidth, url]);


  return (
    <main className="shell">
      <header className="hero">
        <div className="brandRow">
          <div className="brandIdentity"><span className="brandMark">VQ</span><div><strong>Visual QA Browser</strong><small>Local QA Workstation</small></div></div>
          <div className="brandTools"><span className="versionPill">v1.2.0</span><span className="safePill">SAFE MODE · ON</span><a className="guideLink" href="/FUNCTIONS_RU.txt" target="_blank" rel="noreferrer">Справочник функций ↗</a></div>
        </div>
        <p className="eyebrow">EVIDENCE-DRIVEN WEBSITE QUALITY CONTROL</p>
        <h1>Проверка сайта без ложного PASS.</h1>
        <p className="lede">Visual QA Browser проверяет rendered UI, runtime, доступность, SEO, безопасность и пользовательские состояния, сохраняет доказательства и готовит пакет для исправления. <strong>NO EVIDENCE → NO PASS.</strong></p>
        <div className="heroSignals" aria-label="Принципы работы">
          <div><span>01</span><strong>LOCAL FIRST</strong><small>данные и отчёты остаются локально</small></div>
          <div><span>02</span><strong>SAFE MODE</strong><small>опасные действия блокируются</small></div>
          <div><span>03</span><strong>EVIDENCE FIRST</strong><small>каждый вывод привязан к фактам</small></div>
          <div><span>04</span><strong>NO FALSE PASS</strong><small>непроверенное не считается пройденным</small></div>
        </div>
      </header>

      <nav className="sectionNav" aria-label="Разделы приложения">
        <a href="#audit-setup"><span>01</span><strong>Аудит</strong><small>scope · viewport · power</small></a>
        <a href="#history"><span>02</span><strong>История</strong><small>запуски и evidence</small></a>
        <a href="#visual-regression"><span>03</span><strong>До / после</strong><small>visual regression</small></a>
        <a href="#safe-scenarios"><span>04</span><strong>Сценарии</strong><small>safe user journeys</small></a>
        <a href="#fix-bridge"><span>05</span><strong>Fix Bridge</strong><small>исправление проекта</small></a>
      </nav>

      <section className="quickBar" aria-label="Быстрые сценарии">
        <div className="quickIntro"><span>Быстрый старт</span><strong>Выберите рабочий профиль</strong><small>Он изменит только настройки текущего запуска. Перед стартом всё можно проверить вручную.</small></div>
        <QuickWorkflowCard badge="DAILY" title="Ежедневный" description="Основные проверки без Lighthouse" meta="6 экранов · balanced" help="Для регулярной проверки сайта после обычных изменений. Покрывает основные технические модули и шесть ключевых viewport без тяжёлого performance-прогона." tone="daily" onClick={() => applyWorkflow('DAILY')} />
        <QuickWorkflowCard badge="FAST" title="Быстрый re-check" description="Визуал + responsive + runtime" meta="2 экрана · fast" help="Для точечной перепроверки сразу после небольшого исправления. Быстро проверяет desktop 1440 и mobile 390, но не заменяет полный аудит перед релизом." tone="recheck" onClick={() => applyWorkflow('RECHECK')} />
        <QuickWorkflowCard badge="VISUAL" title="Deep Visual" description="Глубокая responsive-проверка" meta="матрица + breakpoint triads" help="Для CSS, layout и responsive-изменений. Проверяет всю viewport-матрицу и соседние точки breakpoint −1/0/+1, чтобы находить скачки интерфейса." tone="visual" onClick={() => applyWorkflow('VISUAL')} />
        <QuickWorkflowCard badge="MAX" title="Максимальный live-аудит" description="Все live-модули и полный охват" meta="deep · all interactions" help="Самый глубокий доступный live-аудит текущего публичного URL: все модули, полная viewport-матрица и interactions на всех выбранных экранах. Не означает реальный Safari/Cross-browser PASS." tone="maximum" primary onClick={() => applyWorkflow('MAX_LIVE')} />
      </section>

      <div className="workspace">
        <form id="audit-setup" className="auditFlow" onSubmit={handleSubmit}>
          <section className="panel stepPanel">
            <div className="stepHeader"><span className="stepNumber">01</span><div><h2>Адрес сайта</h2><p>Публичный HTTP(S) URL.</p></div><InfoTip text={HELP.safeMode} label="Как работает Safe Mode" /></div>
            <label htmlFor="audit-url">URL для проверки</label>
            <input id="audit-url" type="url" value={url} onChange={(event: ChangeEvent<HTMLInputElement>) => setUrl(event.target.value)} required autoComplete="url" spellCheck={false} />
            <p className="guardrail">Safe Mode блокирует мутации, опасные GET, private-network и WebSocket.</p>
          </section>

          <section className="panel stepPanel">
            <div className="stepHeader"><span className="stepNumber">02</span><div><h2>Что проверять</h2><p>Выберите готовый режим или соберите собственный scope.</p></div><InfoTip text="Готовые режимы автоматически включают нужные модули. «Своя комбинация» позволяет включить только конкретные подсистемы. Итоговый verdict относится только к выбранному scope." label="Как выбрать режим аудита" /></div>
            <div className="choiceGrid modeGrid">
              {MODE_DEFINITIONS.map((definition) => <SelectableCard key={definition.id} active={mode === definition.id} badge={definition.accent} title={definition.title} english={definition.english} description={definition.description} help={definition.help} value={definition.id} onSelect={handleModeSelect} />)}
            </div>
            {mode === 'CUSTOM' && <div className="customModules"><div className="subhead"><h3>Модули</h3><p>Включайте только то, что требуется сейчас.</p></div><div className="moduleGrid">{ALL_MODULES.map((module) => <ModuleToggle key={module} module={module} checked={modules.includes(module)} onToggle={handleModuleToggle} />)}</div></div>}
          </section>

          <section className="panel stepPanel">
            <div className="stepHeader"><span className="stepNumber">03</span><div><h2>Глубина экранов</h2><p>Какие размеры браузера попадут в проверку.</p></div><InfoTip text="QUICK — два ключевых экрана. STANDARD — ежедневный набор. DEEP — вся матрица и breakpoint −1/0/+1. SELECTED и CUSTOM нужны для точечного воспроизведения конкретного бага." label="Как выбрать глубину экранов" /></div>
            <div className="choiceGrid viewportPresetGrid">
              {VIEWPORT_PRESETS.map((definition) => <SelectableCard key={definition.id} active={viewportPreset === definition.id} badge={definition.id === 'DEEP' ? 'MAX' : definition.id === 'CUSTOM' ? 'PX' : definition.id.slice(0, 3)} title={definition.title} english={definition.english} description={definition.description} help={definition.help} value={definition.id} onSelect={(value) => setViewportPreset(value as AuditViewportPreset)} />)}
            </div>
            {viewportPreset === 'SELECTED' && <div className="viewportPicker"><div className="viewportGrid">{viewports.map((viewport) => <ViewportToggle key={viewport.name} viewport={viewport} checked={selectedViewportNames.includes(viewport.name)} onToggle={handleViewportToggle} />)}</div></div>}
            {viewportPreset === 'CUSTOM' && <div className="customViewport"><div><label htmlFor="custom-width">Ширина</label><input id="custom-width" type="number" min="240" max="7680" value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} /></div><span>×</span><div><label htmlFor="custom-height">Высота</label><input id="custom-height" type="number" min="240" max="7680" value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} /></div></div>}
            {capabilitiesWarning && <p className="warning">{capabilitiesWarning}</p>}
          </section>

          <section className="panel stepPanel">
            <div className="stepHeader"><span className="stepNumber">04</span><div><h2>Скорость и мощность</h2><p>Больше workers = быстрее, но выше CPU/RAM.</p></div><InfoTip text="Режим мощности не меняет scope, ожидания стабилизации, Safe Mode или критерии PASS. Он влияет только на параллельность." /></div>
            {hardware && <div className="hardwareCard"><span>Этот компьютер</span><strong>{hardware.logicalCpus} логических CPU · {hardware.totalMemoryGb} GB RAM</strong><small>Рекомендовано: {hardware.recommendedPowerMode} · безопасный предел {hardware.safeWorkerCapacity} workers</small></div>}
            <div className="powerGrid">
              {POWER_MODES.map((item) => <SelectableCard key={item.id} active={powerMode === item.id} badge={item.id} title={item.title} english={item.english} description={item.description} help={item.help} value={item.id} onSelect={(value) => setPowerMode(value as AuditPowerMode)} />)}
            </div>
            {(modules.includes('FORMS') || modules.includes('INTERACTIONS')) && <div className="depthBlock"><div className="subhead"><h3>Forms / Interactions</h3><p>Выберите глубину проверки состояний.</p></div><div className="depthGrid">{INTERACTION_DEPTHS.map((item) => <SelectableCard key={item.id} active={interactionDepth === item.id} badge={item.id} title={item.title} english="Interaction depth" description={item.description} help={item.help} value={item.id} onSelect={(value) => setInteractionDepth(value as InteractionDepth)} />)}</div></div>}
          </section>

          <section className="panel stepPanel artDirectorPanel">
            <div className="stepHeader"><span className="stepNumber">05</span><div><h2>AI ART DIRECTOR</h2><p>Premium visual review · отдельный advisory-слой.</p></div><InfoTip text={ART_HELP.module} label="Что делает AI Art Director" /></div>
            <div className="artMasterRow"><label className="switchRow"><input type="checkbox" checked={artEnabled} onChange={(event) => setArtEnabled(event.target.checked)} /><span><strong>Включить AI Art Director</strong><small>Technical QA продолжает работать независимо.</small></span></label><span className="advisoryPill">ADVISORY ONLY</span></div>
            {artEnabled && <>
              <div className="subhead"><h3>Провайдер</h3><p>Manual ничего не отправляет наружу. OpenAI доступен только при локально настроенном API key.</p></div>
              <div className="providerGrid">
                <SelectableCard active={artProvider === 'MANUAL'} badge="LOCAL" title="Manual / ChatGPT export" english="No external upload" description="Evidence package + готовый prompt без автоанализа." help={ART_HELP.manual} value="MANUAL" onSelect={(value) => setArtProvider(value as ArtDirectionProvider)} />
                <SelectableCard active={artProvider === 'OPENAI'} badge={openAiProvider?.configured ? 'AI' : 'OFF'} title="OpenAI Vision" english={openAiProvider?.model ?? 'External AI'} description={openAiProvider?.configured ? 'Автоматический multimodal review.' : 'OPENAI_API_KEY / OPENAI_ART_DIRECTOR_MODEL не настроены.'} help={ART_HELP.openai} value="OPENAI" onSelect={(value) => setArtProvider(value as ArtDirectionProvider)} />
              </div>
              <div className="subhead"><h3>Глубина Art Direction</h3><p>Влияет на количество изображений и глубину advisory analysis.</p></div>
              <div className="artModeGrid">{ART_DIRECTION_MODES.map((item) => <SelectableCard key={item.id} active={artMode === item.id} badge={item.id === 'STANDARD' ? 'REC' : item.id} title={item.title} english="AI review depth" description={item.description} help={item.help} value={item.id} onSelect={(value) => setArtMode(value as ArtDirectionMode)} />)}</div>
              <div className="subhead"><h3>Слои анализа</h3><p>Отключите ненужное, чтобы уменьшить шум и стоимость.</p></div>
              <div className="artLayerGrid">{ART_DIRECTION_LAYERS.map(([id,title,hint]) => <ArtLayerToggle key={id} layer={id as ArtDirectionLayer} title={title} hint={hint} checked={artLayers.includes(id as ArtDirectionLayer)} onToggle={handleArtLayerToggle} />)}</div>
              <div className="profileRow"><label>Brand profile<select value={artProfile} onChange={(event) => setArtProfile(event.target.value as 'AUTO' | 'MELODY4YOU' | 'GENERIC')}><option value="AUTO">AUTO — по домену</option><option value="MELODY4YOU">Example profile — Melody for You</option><option value="GENERIC">Generic</option></select></label><InfoTip text={ART_HELP.profile} /></div>
              <p className="guardrail">External AI analysis: <strong>{artProvider === 'OPENAI' ? 'ON' : 'OFF'}</strong>. Private/authenticated evidence в v1.1 внешнему AI не отправляется вообще.</p>
            </>}
          </section>
        </form>

        <aside className="commandCenter">
          <section className="panel commandPanel">
            <div className="commandKicker">COMMAND CENTER</div><div className="panelTitleRow"><div><h2>Готовность запуска</h2><p>Финальная конфигурация перед стартом.</p></div><span className={`readinessPill ${configurationError ? 'readiness-blocked' : isRunning ? 'readiness-running' : 'readiness-ready'}`}>{configurationError ? 'НУЖНА НАСТРОЙКА' : isRunning ? 'ВЫПОЛНЯЕТСЯ' : 'ГОТОВО'}</span><InfoTip text={HELP.commandCenter} label="Что показывает центр запуска" /></div>
            <div className="commandSummary"><div><span>Scope</span><strong>{selectedMode?.title}</strong></div><div><span>Viewport</span><strong>{selectedPreset?.title}</strong><small>{viewportSummary}</small></div><div><span>Мощность</span><strong>{powerMode}</strong><small>{estimatedLoad}</small></div><div><span>Модулей</span><strong>{modules.length}</strong></div><div><span>Art Director</span><strong>{artEnabled ? `${artProvider} · ${artMode}` : 'OFF'}</strong></div></div>
            {configurationError && <p className="error">{configurationError}</p>}{submitError && <p className="error">{submitError}</p>}
            <button className="runButton" type="button" disabled={submitting || isRunning || Boolean(configurationError)} onClick={() => document.querySelector<HTMLFormElement>('.auditFlow')?.requestSubmit()}><span>{submitting ? 'Запускаю…' : isRunning ? 'Аудит выполняется…' : 'Запустить аудит'}</span><small>{artEnabled ? 'Technical QA + Art Direction' : modules.includes('PERFORMANCE') ? 'включая Lighthouse' : 'evidence-driven audit'}</small></button>
          </section>

          <section className="panel livePanel">
            <div className="liveHeader"><div><span>LIVE STATUS</span><strong>{statusText}</strong></div><InfoTip text={HELP.progress} /></div>
            <div className="progressValue"><strong>{progressPercent}%</strong><span>{job?.completedSteps ?? 0} / {job?.totalSteps ?? 0} этапов</span></div>
            <div className="progressTrack" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}><span style={{ width: `${progressPercent}%` }} /></div>
            <dl className="liveMeta"><div><dt>Сейчас</dt><dd>{stageLabel(job?.currentStage)}</dd></div><div><dt>Viewport</dt><dd>{job?.currentViewport ?? '—'}</dd></div><div><dt>Подсистема</dt><dd>{subsystemLabel(job?.currentSubsystem)}</dd></div><div><dt>Осталось</dt><dd>{job?.remainingSteps ?? 0} этапов</dd></div></dl>
            {isRunning && <button className="stopButton" type="button" disabled={cancelBusy} onClick={handleCancel}>{cancelBusy ? 'Остановка…' : 'Остановить аудит'}</button>}{cancelStatus && <p className="microStatus">{cancelStatus}</p>}
            {job?.error && <p className="error">{job.error}</p>}
            {job?.reportUrl && <div className="resultActions"><a className="reportButton" href={job.reportUrl} target="_blank" rel="noreferrer">Открыть русский отчёт</a>{job.gptEvidenceUrl && <a className="reportButton secondaryReport" href={job.gptEvidenceUrl} download>Скачать ZIP для GPT · дефекты и скриншоты</a>}{job.artImageBoardUrl && <a className="reportButton secondaryReport" href={job.artImageBoardUrl} target="_blank" rel="noreferrer">Image Board</a>}{job.artEvidenceUrl && <a className="reportButton secondaryReport" href={job.artEvidenceUrl} target="_blank" rel="noreferrer">Art evidence</a>}{job.gptPromptUrl && <button className="copyButton" type="button" onClick={handleCopyGpt}>Технические → ChatGPT</button>}{job.premiumGptPromptUrl && <button className="copyButton premiumCopy" type="button" onClick={handleCopyPremiumGpt}>Technical + Art → ChatGPT</button>}</div>}
            {copyStatus && <p className="copyStatus">{copyStatus}</p>}
          </section>
        </aside>
      </div>

      <section id="history" className="panel historyPanel">
        <div className="panelHeader"><div><span className="commandKicker">HISTORY</span><h2>Последние проверки</h2><p>Верните настройки прошлого запуска, откройте evidence или выберите аудит для сравнения.</p></div><InfoTip text="История хранится локально. «Повторить настройки» восстанавливает конфигурацию, а «Выбрать для сравнения» делает этот аудит текущим объектом для модуля «До / после»." label="Как работает история" /></div>
        <div className="historyGrid">{history.length === 0 ? <div className="emptyHistory"><span>HISTORY</span><strong>Пока нет завершённых запусков</strong><small>После первого аудита здесь появятся настройки, статус и быстрый доступ к evidence.</small></div> : history.map((item) => <article className="historyItem" key={item.id}><div className="historyTop"><span className={`historyStatus history-${item.status.toLowerCase()}`}>{STATUS_RU[item.status] ?? item.status}</span><time>{formatDate(item.createdAt)}</time></div><strong>{MODE_DEFINITIONS.find((definition) => definition.id === item.configuration.mode)?.title ?? item.configuration.mode}</strong><p>{item.configuration.viewportPreset} · {item.configuration.powerMode ?? 'NORMAL'} · {item.configuration.modules.length} модулей</p><div className="historyActions"><button type="button" onClick={() => repeatSettings(item)}>Повторить</button>{item.reportUrl && <button type="button" onClick={() => { setJobId(item.id); setComparison(null); }}>Сравнить</button>}{item.reportUrl && <a href={item.reportUrl} target="_blank" rel="noreferrer">Отчёт</a>}</div></article>)}</div>
      </section>

      <section id="visual-regression" className="panel advancedPanel regressionPanel" aria-label="Визуальное сравнение">
        <div className="panelHeader"><div><span className="commandKicker">VISUAL REGRESSION</span><h2>До / после</h2><p>Зафиксируйте полный аудит как эталон и сравнивайте последующие снимки при одинаковых условиях.</p></div><InfoTip text={HELP.baseline} label="Как работает сравнение до и после" /></div>
        <div className="moduleFacts" aria-label="Правила визуального сравнения"><div><span>Эталон</span><strong>Только полный аудит</strong><small>PASS или ISSUE · без PARTIAL</small></div><div><span>Сопоставимость</span><strong>Одинаковая среда</strong><small>OS · Chromium · viewport</small></div><div><span>Результат</span><strong>REVIEW ≠ BUG</strong><small>изменения оцениваются глазами</small></div></div>
        <div className="advancedActions">
          <button type="button" disabled={visualBusy || !job?.reportUrl || !['PASS', 'ISSUE'].includes(job.status)} onClick={approveBaseline}>Утвердить текущий аудит как эталон</button>
          <label htmlFor="baseline-select">Эталон
            <select id="baseline-select" value={baselineId} onChange={(event) => { setBaselineId(event.target.value); setComparison(null); }}>
              <option value="">Выберите эталон</option>
              {baselines.map((item) => <option key={item.id} value={item.id}>{formatDate(item.createdAt)} · {item.captures.length} экранов · {item.browserVersion}</option>)}
            </select>
          </label>
          <button type="button" disabled={visualBusy || !job?.reportUrl || !baselineId} onClick={compareBaseline}>Сравнить с выбранным аудитом</button>
        </div>
        {visualStatus && <p className="microStatus" role="status">{visualStatus}</p>}
        {comparison && <div className="comparisonResults"><div className={`resultHeadline result-${comparison.status.toLowerCase()}`}><span>Итог сравнения</span><strong>{comparisonStatusLabel(comparison.status)}</strong></div><p>{comparison.note}</p>
          {comparison.items.map((item) => <article key={item.viewport} className="comparisonItem">
            <h3>{item.viewport}<span className={`comparisonBadge comparison-${item.status.toLowerCase()}`}>{comparisonStatusLabel(item.status)}</span></h3>
            {item.reason && <p className="warning">{item.reason}</p>}
            {item.ratio !== undefined && <p>Отличается {(item.ratio * 100).toFixed(2)}% пикселей ({item.differentPixels}). {item.status === 'REVIEW' ? 'Изменения требуют ручного просмотра.' : 'Значимых пиксельных отличий не найдено.'}</p>}
            {item.baselineUrl && item.currentUrl && <div className="comparisonImages">
              <figure><img src={item.baselineUrl} alt={`Эталон ${item.viewport}`} loading="lazy" /><figcaption>До · утверждённый эталон</figcaption></figure>
              <figure><img src={item.currentUrl} alt={`Текущий снимок ${item.viewport}`} loading="lazy" /><figcaption>После · новый аудит</figcaption></figure>
              {item.diffUrl && <figure><img src={item.diffUrl} alt={`Различия ${item.viewport}`} loading="lazy" /><figcaption>Красным — различия</figcaption></figure>}
            </div>}
          </article>)}
        </div>}
        <p className="guardrail">Сравнение требует одинаковых ОС, версии Chromium и настроек viewport. Динамический контент может давать различия без дефекта. Эталон хранится только локально; проверьте скриншоты на персональные данные.</p>
      </section>

      <section id="safe-scenarios" className="panel advancedPanel scenarioPanel" aria-label="Пользовательские сценарии">
        <div className="panelHeader"><div><span className="commandKicker">SAFE USER JOURNEYS</span><h2>Проверка сценария</h2><p>Проверьте реальный путь пользователя: видимость, текст, меню, checkbox и тестовый ввод без опасных действий.</p></div><InfoTip text={HELP.scenario} label="Как работают безопасные сценарии" /></div>
        <div className="moduleFacts scenarioFacts" aria-label="Правила безопасного сценария"><div><span>Шаги</span><strong>До 12 действий</strong><small>явные селекторы и ожидания</small></div><div><span>Безопасность</span><strong>Сеть блокируется</strong><small>после первичной загрузки</small></div><div><span>Evidence</span><strong>Screenshot + trace</strong><small>для подтверждённых шагов</small></div></div>
        <div className="scenarioMeta">
          <label>Название<input value={scenarioName} maxLength={80} onChange={(event) => setScenarioName(event.target.value)} /></label>
          <label>Ширина сценария<input type="number" min={240} max={1920} value={scenarioWidth} onChange={(event) => setScenarioWidth(Number(event.target.value))} /></label>
          <label>Высота сценария<input type="number" min={240} max={1200} value={scenarioHeight} onChange={(event) => setScenarioHeight(Number(event.target.value))} /></label>
        </div>
        <div className="scenarioSteps">{scenarioSteps.map((step, index) => <div className="scenarioStep" key={index}>
          <span>{index + 1}</span>
          <label>Действие<select value={step.action} onChange={(event) => updateScenarioStep(index, { action: event.target.value as ScenarioAction, value: '' })}>
            <option value="assertVisible">Проверить видимость</option><option value="assertText">Проверить текст</option>
            <option value="click">Открыть меню / вкладку</option><option value="check">Выбрать checkbox / radio</option>
            <option value="fill">Ввести тестовый текст</option>
          </select></label>
          <label>CSS-селектор<input value={step.selector} maxLength={300} placeholder="#menu-button" onChange={(event) => updateScenarioStep(index, { selector: event.target.value })} /></label>
          {(step.action === 'fill' || step.action === 'assertText') && <label>{step.action === 'fill' ? 'Тестовое значение' : 'Ожидаемый текст'}<input value={step.value} maxLength={120} onChange={(event) => updateScenarioStep(index, { value: event.target.value })} /></label>}
          <button type="button" disabled={scenarioBusy || scenarioSteps.length === 1} onClick={() => setScenarioSteps((current) => current.filter((_, at) => at !== index))}>Убрать</button>
        </div>)}</div>
        <div className="advancedActions"><button type="button" disabled={scenarioBusy || scenarioSteps.length >= 12} onClick={() => setScenarioSteps((current) => [...current, { action: 'assertVisible', selector: '', value: '' }])}>Добавить шаг</button>
          <button type="button" disabled={scenarioBusy} onClick={exportScenario}>Скачать сценарий JSON</button>
          <label>Открыть сценарий JSON<input type="file" accept=".json,application/json" disabled={scenarioBusy} onChange={(event) => { void importScenario(event); }} /></label>
          <button type="button" disabled={scenarioBusy || !scenarioName.trim() || scenarioSteps.some((step) => !step.selector.trim() || ((step.action === 'fill' || step.action === 'assertText') && !step.value.trim()))} onClick={runScenario}>{scenarioBusy ? 'Проверяю…' : 'Запустить безопасный сценарий'}</button>
        </div>
        {scenarioStatus && <p className="microStatus" role="status">{scenarioStatus}</p>}
        {scenarioResult && <div className="scenarioResults"><div className={`resultHeadline result-${scenarioResult.status.toLowerCase()}`}><span>Итог сценария</span><strong>{scenarioStatusLabel(scenarioResult.status)}</strong></div>
          <ol>{scenarioResult.steps.map((step) => <li key={step.number}><strong>{step.action} · {step.status}</strong> — {step.message}{step.screenshotUrl && <a href={step.screenshotUrl} target="_blank" rel="noreferrer"> Скриншот</a>}</li>)}</ol>
          {scenarioResult.traceUrl && <a href={scenarioResult.traceUrl} download>Скачать trace.zip для разбора шагов</a>}
          <p>{scenarioResult.note}</p>
        </div>}
        <p className="guardrail">Вводите только вымышленные тестовые данные. После первоначальной загрузки Safe Mode блокирует сеть. Ссылки, отправка форм, оплата и удаление не выполняются. Код самой страницы может реагировать на разрешённое действие в одноразовом браузере. Сценарий JSON, trace и скриншоты могут содержать введённый текст: перед передачей вовне просмотрите их.</p>
      </section>

      <section id="fix-bridge" className="panel fixBridgePanel">
        <div className="panelHeader fixBridgeHeader">
          <div>
            <span className="commandKicker">CHATGPT FIX BRIDGE</span>
            <h2>Минимум действий: аудит → один ZIP → мои исправления → применить</h2>
            <p>Исходники не отправляются автоматически. Пакет создаётся только по вашей кнопке; секреты, зависимости и build-output исключаются.</p>
          </div>
          <div className="fixHeaderTools"><InfoTip text="Fix Bridge собирает безопасный snapshot исходников и evidence, затем принимает только подписанный структурированный Fix Package. Проектные scripts автоматически не запускаются." label="Как работает Fix Bridge" /><span className="safePill">БЕЗ ЗАПУСКА КОДА · HASH LOCK</span></div>
        </div>
        <div className="fixBridgeGrid">
          <article className="fixStep">
            <span className="fixStepNumber">01</span>
            <div>
              <h3>Папка проекта</h3>
              <p>Укажите один раз локальную папку сайта. Путь сохраняется только в этом браузере.</p>
              <label htmlFor="project-root">Локальный проект</label>
              <input id="project-root" type="text" value={projectRoot} onChange={(event: ChangeEvent<HTMLInputElement>) => handleProjectRootChange(event.target.value)} placeholder="C:\Projects\melody-for-you" spellCheck={false} disabled={fixBridgeBusy} />
              <button className="fixAction secondaryFixAction" type="button" disabled={fixBridgeBusy || !projectRoot.trim()} onClick={handleInspectWorkspace}>Проверить папку</button>
              {workspaceInspection && <p className="fixEvidence">{workspaceInspection.fileCount} файлов · {bytesLabel(workspaceInspection.totalBytes)} · fingerprint {workspaceInspection.fingerprint.slice(0, 12)}…</p>}
              {workspaceInspection?.warnings.map((warning) => <p className="fixWarning" key={warning}>{warning}</p>)}
            </div>
          </article>
          <article className="fixStep">
            <span className="fixStepNumber">02</span>
            <div>
              <h3>Один ZIP для меня</h3>
              <p>После завершённого аудита пакет объединит BUG/CAND/evidence и безопасную snapshot-копию исходников.</p>
              <button className="fixAction" type="button" disabled={fixBridgeBusy || !projectRoot.trim() || !job?.reportUrl} onClick={handleCreateFixPack}>Собрать Fix Pack для ChatGPT</button>
              <small>Потом просто прикрепите этот ZIP в наш чат и напишите «го».</small>
            </div>
          </article>
          <article className="fixStep">
            <span className="fixStepNumber">03</span>
            <div>
              <h3>Применить мой Fix Package</h3>
              <p>Перед записью: manifest → fingerprint → SHA-256 → неисполняющий precheck → hash-verified backup → atomic replace/create. Project scripts и исходный код автоматически не запускаются.</p>
              <label className="fixFileLabel" htmlFor="fix-package">ZIP с исправлениями</label>
              <input id="fix-package" className="fixFileInput" type="file" accept=".zip,application/zip" onChange={handleFixPackageSelect} />
              <button className="fixAction" type="button" disabled={fixBridgeBusy || !selectedFixPackage || !projectRoot.trim()} onClick={handleApplyFixPackage}>{fixBridgeBusy ? 'Выполняется…' : 'Применить исправления'}</button>
              {appliedFix && <div className={`verificationCard verify-${appliedFix.verification.status.toLowerCase()}`}>
                <strong>{appliedFix.verification.status}</strong>
                <span>{appliedFix.verification.note}</span>
                <small>Backup: {appliedFix.backupId}</small>
                {appliedFix.warnings.map((warning) => <p className="fixWarning" key={warning}>{warning}</p>)}
                {appliedFix.verification.commands.map((command) => <details key={command.script}><summary>{command.script} · {command.status}</summary><pre>{command.output || command.command}</pre></details>)}
                <div className="fixInlineActions"><button type="button" onClick={handleRollbackFix} disabled={fixBridgeBusy}>Rollback</button><button type="button" onClick={handlePostDeployRecheck} disabled={fixBridgeBusy || !job}>Live re-check после загрузки</button></div>
              </div>}
              {!appliedFix && latestRollbackBackup && <div className="verificationCard verify-not_verified">
                <strong>RECOVERY AVAILABLE</strong>
                <span>Найден сохранённый backup после предыдущего запуска. Rollback доступен даже после перезапуска приложения.</span>
                <small>{latestRollbackBackup.fixId} · {latestRollbackBackup.createdAt} · {latestRollbackBackup.fileCount} файлов</small>
                <div className="fixInlineActions"><button type="button" onClick={handleRollbackFix} disabled={fixBridgeBusy}>Rollback последнего Fix Package</button></div>
              </div>}
              {fixBackupWarnings.map((warning) => <p className="fixWarning" key={warning}>Backup warning: {warning}</p>)}
            </div>
          </article>
        </div>
        {fixBridgeStatus && <p className="fixBridgeStatus" aria-live="polite">{fixBridgeStatus}</p>}
        <p className="guardrail">Критический предел: программа не может встроить этот конкретный чат ChatGPT внутрь себя. Передача Fix Pack сюда остаётся ручной. Fix Bridge принципиально не запускает project scripts автоматически: временная папка не является OS sandbox. После применения runtime/type/lint/test/build остаются отдельным verification gate. Импортируйте Fix Package только из доверенного чата.</p>
      </section>

      <section className="limitsStrip"><div><strong>Source audit</strong><span>Fix Bridge передаёт snapshot исходников; отдельный source-verdict пока не включён</span></div><div><strong>Visual regression</strong><span>локальное сравнение с утверждённым эталоном; различия требуют ручной оценки</span></div><div><strong>Cross-browser</strong><span>Firefox/WebKit пока не входят в live-scope</span></div><div><strong>Private/Auth</strong><span>нужен отдельный session/storage-state workflow</span></div><div><strong>Safari PASS</strong><span>только реальный Safari/macOS/iOS</span></div></section>
    </main>
  );
}
