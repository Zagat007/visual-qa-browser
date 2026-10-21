import type { AuditMode, AuditModule, AuditPowerMode, AuditViewportPreset, InteractionDepth } from './types';
import { HELP } from './help';

export interface ModeDefinition {
  id: AuditMode;
  title: string;
  english: string;
  description: string;
  modules: AuditModule[];
  accent: string;
  help: string;
}

export const ALL_MODULES: AuditModule[] = ['VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'RUNTIME', 'ACCESSIBILITY', 'SEO', 'SECURITY', 'PERFORMANCE'];

export const MODE_DEFINITIONS: ModeDefinition[] = [
  { id: 'FULL', title: 'Все проверки URL', english: 'Full live audit', description: 'Все доступные live-модули текущего URL; глубина зависит от размеров и настроек.', modules: ALL_MODULES, accent: 'MAX', help: HELP.full },
  { id: 'VISUAL', title: 'Только визуал', english: 'Visual QA', description: 'Layout, типографика, изображения, overflow и clipping.', modules: ['VISUAL'], accent: 'UI', help: HELP.visual },
  { id: 'RESPONSIVE', title: 'Адаптивность', english: 'Responsive QA', description: 'Viewport matrix + continuity sweep.', modules: ['VISUAL', 'RESPONSIVE'], accent: 'RWD', help: HELP.responsive },
  { id: 'FORMS', title: 'Только формы', english: 'Forms audit', description: 'Поля, labels, input attributes, touch targets.', modules: ['FORMS'], accent: 'FORM', help: HELP.forms },
  { id: 'INTERACTIONS', title: 'Интерактив', english: 'Interaction states', description: 'Hover/focus/open и безопасные состояния.', modules: ['INTERACTIONS'], accent: 'STATE', help: HELP.interactions },
  { id: 'RUNTIME', title: 'Ошибки и сеть', english: 'Runtime / Network', description: 'Console, JS, 4xx/5xx, assets, network.', modules: ['RUNTIME'], accent: 'LOG', help: HELP.runtime },
  { id: 'ACCESSIBILITY', title: 'Доступность', english: 'Accessibility', description: 'axe-core automated accessibility evidence.', modules: ['ACCESSIBILITY'], accent: 'A11Y', help: HELP.accessibility },
  { id: 'SEO', title: 'SEO', english: 'Technical SEO', description: 'Metadata, headings, robots, sitemap, soft-404.', modules: ['SEO'], accent: 'SEO', help: HELP.seo },
  { id: 'SECURITY', title: 'Безопасная доставка', english: 'Passive security', description: 'HTTPS, headers и cookie flags.', modules: ['SECURITY'], accent: 'SAFE', help: HELP.security },
  { id: 'PERFORMANCE', title: 'Производительность', english: 'Lighthouse', description: '3 cold runs + median lab metrics.', modules: ['PERFORMANCE'], accent: 'PERF', help: HELP.performance },
  { id: 'CUSTOM', title: 'Своя комбинация', english: 'Custom scope', description: 'Выберите только нужные подсистемы.', modules: ['VISUAL'], accent: 'CFG', help: 'Ручная комбинация модулей. Verdict относится только к выбранному scope.' },
];

export const MODULE_LABELS: Record<AuditModule, { title: string; english: string; hint: string; help: string }> = {
  VISUAL: { title: 'Визуал', english: 'Visual', hint: 'layout / typography / images', help: HELP.visual },
  RESPONSIVE: { title: 'Адаптивность', english: 'Responsive', hint: 'continuity / overflow', help: HELP.responsive },
  FORMS: { title: 'Формы', english: 'Forms', hint: 'fields / labels / targets', help: HELP.forms },
  INTERACTIONS: { title: 'Интерактив', english: 'Interactions', hint: 'hover / focus / safe states', help: HELP.interactions },
  RUNTIME: { title: 'Ошибки и сеть', english: 'Runtime', hint: 'console / network / assets', help: HELP.runtime },
  ACCESSIBILITY: { title: 'Доступность', english: 'Accessibility', hint: 'axe-core automated', help: HELP.accessibility },
  SEO: { title: 'SEO', english: 'Technical SEO', hint: 'meta / robots / soft-404', help: HELP.seo },
  SECURITY: { title: 'Безопасность', english: 'Passive security', hint: 'HTTPS / headers / cookies', help: HELP.security },
  PERFORMANCE: { title: 'Производительность', english: 'Performance', hint: 'Lighthouse / median / lab', help: HELP.performance },
};

export interface ViewportPresetDefinition {
  id: AuditViewportPreset;
  title: string;
  english: string;
  description: string;
  help: string;
}

export const VIEWPORT_PRESETS: ViewportPresetDefinition[] = [
  { id: 'QUICK', title: 'Быстро', english: 'Quick', description: 'Desktop 1440 + mobile 390.', help: HELP.quick },
  { id: 'STANDARD', title: 'Стандарт', english: 'Standard', description: '6 основных desktop/tablet/mobile размеров.', help: HELP.standard },
  { id: 'DEEP', title: 'Все размеры', english: 'Deep matrix', description: 'Полная матрица + breakpoint −1 / 0 / +1.', help: HELP.deep },
  { id: 'SELECTED', title: 'Выбрать размеры', english: 'Selected', description: 'Только отмеченные размеры.', help: HELP.selected },
  { id: 'CUSTOM', title: 'Своё разрешение', english: 'Custom viewport', description: 'Точная ширина × высота вручную.', help: HELP.custom },
];

export const POWER_MODES: Array<{ id: AuditPowerMode; title: string; english: string; description: string; help: string }> = [
  { id: 'ECO', title: 'ЭКО', english: 'Eco', description: 'Минимальная нагрузка · 1 worker', help: HELP.eco },
  { id: 'NORMAL', title: 'Нормальный', english: 'Normal', description: 'Баланс · до 2 workers', help: HELP.normal },
  { id: 'FAST', title: 'FAST', english: 'Fast', description: 'Быстрее · до 4 workers', help: HELP.fast },
  { id: 'MAX', title: 'MAX', english: 'Maximum', description: 'Максимум · до 6 workers', help: HELP.max },
];

export const INTERACTION_DEPTHS: Array<{ id: InteractionDepth; title: string; description: string; help: string }> = [
  { id: 'KEY', title: 'Ключевые viewport', description: 'До 2 основных экранов', help: HELP.interactionKey },
  { id: 'ALL', title: 'Все выбранные viewport', description: 'Максимальная глубина', help: HELP.interactionAll },
];

export const STATUS_RU: Record<string, string> = {
  QUEUED: 'В очереди', RUNNING: 'Выполняется', PASS: 'PASS — проверка пройдена', ISSUE: 'Найдены проблемы', PARTIAL: 'Частично проверено', FAILED: 'Ошибка выполнения', NOT_VERIFIED: 'Не подтверждено', CANCELLED: 'Остановлено пользователем',
};

export function stageLabel(stage?: string): string {
  if (!stage) return 'Подготовка';
  const direct: Record<string, string> = {
    queued: 'Ожидание запуска', preflight: 'Предварительная проверка', 'launch-browser': 'Запуск браузера',
    'responsive-sweep': 'Проверка responsive continuity', 'technical-site-checks': 'Техническая проверка сайта',
    performance: 'Lighthouse performance', 'art-direction': 'AI Art Director', report: 'Формирование отчёта', complete: 'Завершено', failed: 'Ошибка', cancelled: 'Остановлено', cancelling: 'Остановка…', 'performance:incomplete-skipped': 'Lighthouse · измерение неполное, продолжаю аудит',
  };
  if (direct[stage]) return direct[stage];
  const perfProgress = stage.match(/^performance:run-(\d+):(launch|connect|guard|measure|save):(\d+):(\d+)$/);
  if (perfProgress) {
    const phases: Record<string, string> = { launch: 'запуск Chrome', connect: 'подключение', guard: 'Safe Mode', measure: 'измерение', save: 'сохранение' };
    return `Lighthouse · прогон ${perfProgress[1]} из 3 · ${phases[perfProgress[2] ?? ''] ?? ''} · ${perfProgress[3]} с / лимит ${perfProgress[4]} с`;
  }
  const perf = stage.match(/^performance:run-(\d+)$/);
  if (perf) return `Lighthouse · прогон ${perf[1]} из 3`;
  const match = stage.match(/^(.+):(navigate|stabilize|measure|capture|complete|failed|interactions|forms)$/);
  if (!match) return stage;
  const labels: Record<string, string> = { navigate: 'Открытие страницы', stabilize: 'Стабилизация render', measure: 'Сбор evidence', capture: 'Скриншот', complete: 'Готово', failed: 'Ошибка', interactions: 'Интерактив', forms: 'Формы' };
  const action = match[2] ?? '';
  const viewport = match[1] ?? '';
  return `${labels[action] ?? action} · ${viewport}`;
}

export function subsystemLabel(subsystem?: string): string {
  const labels: Record<string, string> = {
    BROWSER: 'Браузер', NAVIGATION: 'Навигация', STABILIZATION: 'Стабилизация render', EVIDENCE: 'Сбор evidence',
    SCREENSHOT: 'Скриншоты', CAPTURE: 'Capture', RESPONSIVE: 'Адаптивность', SEO: 'SEO / технические проверки',
    INTERACTIONS: 'Интерактив', FORMS: 'Формы', PERFORMANCE: 'Lighthouse / Performance', ART_DIRECTION: 'AI Art Director', REPORT: 'Формирование отчёта',
  };
  return subsystem ? (labels[subsystem] ?? subsystem) : '—';
}

export const ART_DIRECTION_MODES = [
  { id: 'ECONOMY', title: 'ECONOMY', description: 'Ключевые экраны · до 8 изображений', help: 'Минимальная стоимость внешнего AI. Подходит для быстрого premium-check и поиска самых заметных визуальных проблем.' },
  { id: 'STANDARD', title: 'STANDARD', description: 'Основные секции · до 20 изображений', help: 'Рекомендуемый режим: анализ основных section screenshots, image relevance, hierarchy и consistency.' },
  { id: 'DEEP', title: 'DEEP', description: 'Глубокий review · до 40 изображений', help: 'Максимальная глубина: cross-section, cross-viewport и более полный image review. Самый дорогой режим внешнего AI.' },
] as const;

export const ART_DIRECTION_LAYERS = [
  ['PREMIUM_QUALITY', 'Premium Quality', 'Premium perception / agency-grade polish'],
  ['IMAGE_QUALITY_VARIETY', 'Изображения и разнообразие', 'Quality, monotony, apparent repetition'],
  ['SEMANTIC_IMAGE_FIT', 'Соответствие изображения смыслу', 'Section text ↔ image semantic fit'],
  ['VISUAL_HIERARCHY', 'Визуальная иерархия', 'Что замечается первым и правильно ли это'],
  ['TYPOGRAPHY_SPACING', 'Typography & Spacing', 'Hierarchy, wrapping, density, rhythm'],
  ['EMOTIONAL_FIT', 'Эмоциональное соответствие', 'Соответствует ли визуальный тон задаче'],
  ['CONVERSION', 'Коммерческая подача', 'CTA, price, trust, decision clarity'],
  ['CROSS_SECTION', 'Consistency секций', 'Quality gaps и повторение treatments'],
  ['CROSS_PAGE', 'Consistency страниц', 'Требует evidence нескольких страниц; на single-page audit будет NOT VERIFIED'],
  ['MOBILE', 'Mobile Art Direction', 'Crop, hierarchy, whitespace, CTA на mobile'],
  ['DESKTOP', 'Desktop Art Direction', 'Composition и hierarchy на desktop'],
] as const;
