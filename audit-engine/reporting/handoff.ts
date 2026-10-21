import fs from 'node:fs/promises';
import path from 'node:path';
import type { AuditResult } from '../shared/types.js';
import { storedZip, type ZipEntry } from './zip.js';
import { sanitizeExternalArtifact, sanitizeExternalJson } from '../privacy/redaction.js';

export interface HandoffIssue { id: string; page: string; viewports: string[]; state: string; severity: string; rule: string; category: string }
const MAX_IMAGE_BYTES = 48 * 1024 * 1024;
const MAX_FULL_PAGE_HEIGHT = 16_000;

function screenshotRelevantIssue(issue: HandoffIssue): boolean {
  return [
    'Визуал / геометрия',
    'Визуал / изображения',
    'Визуал / типографика',
    'Адаптивность',
    'Формы',
    'Интерактив',
  ].includes(issue.category) || issue.rule === 'broken-image';
}

function jsonEntry(name: string, value: unknown): ZipEntry {
  return { name, content: Buffer.from(`${JSON.stringify(sanitizeExternalJson(value), null, 2)}\n`) };
}

/** Bundles local evidence for a user-initiated upload. Nothing is sent to an AI service. */
export async function writeGptHandoff(reportDir: string, result: AuditResult, issues: readonly HandoffIssue[],
  technicalPrompt: string, premiumPrompt: string | null, defectsJson: string, candidatesJson: string, hypothesesJson: string): Promise<void> {
  const entries: ZipEntry[] = [
    { name: 'gpt-fix-prompt.txt', content: sanitizeExternalArtifact('gpt-fix-prompt.txt', Buffer.from(technicalPrompt + '\n')) },
    { name: 'defects.json', content: sanitizeExternalArtifact('defects.json', Buffer.from(defectsJson)) },
    { name: 'candidates.json', content: sanitizeExternalArtifact('candidates.json', Buffer.from(candidatesJson)) },
    { name: 'root-cause-hypotheses.json', content: sanitizeExternalArtifact('root-cause-hypotheses.json', Buffer.from(hypothesesJson)) },
    jsonEntry('machine/provenance.json', {
      jobId: result.jobId,
      status: result.status,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      requestedUrl: result.requestedUrl,
      configuration: result.configuration,
      metadata: result.metadata,
      execution: result.execution ?? null,
      captures: result.captures.map((capture) => ({
        viewport: capture.viewport,
        deviceContext: capture.deviceContext,
        capturedAt: capture.capturedAt,
        screenshotBytes: capture.screenshotBytes,
        captureAttempts: capture.captureAttempts,
        documentSize: capture.documentSize,
        stabilization: capture.stabilization,
      })),
    }),
    jsonEntry('machine/security-delivery.json', result.captures.map((capture) => ({ viewport: capture.viewport.name, delivery: capture.delivery }))),
    jsonEntry('machine/accessibility.json', result.captures.map((capture) => ({ viewport: capture.viewport.name, accessibility: capture.accessibility }))),
    jsonEntry('machine/runtime.json', result.captures.map((capture) => ({ viewport: capture.viewport.name, runtime: capture.runtime }))),
    jsonEntry('machine/site-technical.json', result.siteTechnical ?? { status: 'NOT_REQUESTED' }),
    jsonEntry('machine/performance-summary.json', result.performance ?? { status: result.performanceFailure ? 'FAILED' : 'NOT_REQUESTED', error: result.performanceFailure ?? undefined }),
  ];
  if (premiumPrompt) entries.push({ name: 'gpt-premium-fix-prompt.txt', content: sanitizeExternalArtifact('gpt-premium-fix-prompt.txt', Buffer.from(premiumPrompt + '\n')) });
  if (result.artDirection) {
    for (const name of ['art-direction-evidence.json', 'art-direction-prompt.txt', 'art-direction.json']) {
      try { entries.push({ name, content: sanitizeExternalArtifact(name, await fs.readFile(path.join(reportDir, name))) }); }
      catch { /* The manifest below documents missing optional Art Direction files. */ }
    }
  }
  const realReportDir = await fs.realpath(reportDir);
  for (const run of result.performance?.runs ?? []) {
    if (!run.measurementPath) continue;
    try {
      const realFile = await fs.realpath(run.measurementPath);
      const relative = path.relative(realReportDir, realFile);
      if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(realFile).toLowerCase() !== '.json') throw new Error('Performance evidence outside report');
      const name = `machine/performance/run-${run.run}-measurement.json`;
      entries.push({ name, content: sanitizeExternalArtifact(name, await fs.readFile(realFile)) });
    } catch { /* performance-summary.json still records that the raw core file was unavailable */ }
  }
  const included: Array<{ viewport: string; file: string; issueIds: string[]; kind: 'responsive-exact' | 'full-page' }> = [];
  const sections: Array<{ viewport: string; name: string; selector: string; file: string }> = [];
  const omitted: Array<{ viewport: string; reason: string }> = [];
  let imageBytes = 0;
  const visualIssues = issues.filter(screenshotRelevantIssue);
  // Prioritize exact responsive BUG evidence before other captured viewports.
  // Section captures come next so very tall pages do not consume the budget
  // with a single 30k+ pixel full-page PNG.
  const captured = new Map(result.captures.map((capture) => [capture.viewport.name, capture]));
  const required = [...new Set(visualIssues.flatMap((issue) => issue.viewports).filter((name) => captured.has(name)))];
  const approximate = new Map<string, string[]>();
  for (const issue of visualIssues) {
    if (issue.viewports.some((name) => captured.has(name)) || result.captures.length === 0) continue;
    if (issue.rule === 'responsive-overflow') continue;
    const range = issue.viewports.map((name) => name.match(/^(\d+)→(\d+)px$/)).find(Boolean);
    const targetWidth = range ? (Number(range[1]) + Number(range[2])) / 2 : result.captures[0]!.viewport.width;
    const nearest = [...result.captures].sort((a, b) =>
      Math.abs(a.viewport.width - targetWidth) - Math.abs(b.viewport.width - targetWidth))[0]!;
    approximate.set(nearest.viewport.name, [...(approximate.get(nearest.viewport.name) ?? []), issue.id]);
  }
  const exactResponsiveIds = new Set<string>();
  for (const finding of result.responsiveSweep?.findings ?? []) {
    const evidence = finding.verification;
    if (finding.rule !== 'responsive-overflow' || evidence?.status !== 'CONFIRMED' || !evidence.screenshotPath) continue;
    const matching = visualIssues.filter((issue) => issue.rule === finding.rule && issue.viewports.includes(`${finding.fromWidth}→${finding.toWidth}px`));
    if (matching.length === 0) continue;
    const file = `responsive/width-${evidence.width}.png`;
    try {
      const realFile = await fs.realpath(evidence.screenshotPath);
      const relative = path.relative(realReportDir, realFile);
      if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(realFile).toLowerCase() !== '.png') throw new Error('Responsive image outside report');
      const size = (await fs.stat(realFile)).size;
      if (size > MAX_IMAGE_BYTES - imageBytes) { omitted.push({ viewport: `${evidence.width}px`, reason: 'size limit' }); continue; }
      entries.push({ name: file, content: await fs.readFile(realFile) });
      imageBytes += size;
      included.push({ viewport: `${evidence.width}px`, file, issueIds: matching.map((issue) => issue.id), kind: 'responsive-exact' });
      for (const issue of matching) exactResponsiveIds.add(issue.id);
    } catch {
      omitted.push({ viewport: `${evidence.width}px`, reason: 'exact responsive screenshot unavailable or size limit' });
    }
  }
  for (const capture of result.captures) {
    for (const [index, section] of capture.sectionScreenshots.entries()) {
      const file = `sections/${capture.viewport.name}/${String(index + 1).padStart(2, '0')}.png`;
      try {
        const realFile = await fs.realpath(section.screenshotPath);
        const relative = path.relative(realReportDir, realFile);
        if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(realFile).toLowerCase() !== '.png') throw new Error('Section image outside report');
        const size = (await fs.stat(realFile)).size;
        if (size > MAX_IMAGE_BYTES - imageBytes) { omitted.push({ viewport: `${capture.viewport.name}/${section.name}`, reason: 'size limit' }); continue; }
        entries.push({ name: file, content: await fs.readFile(realFile) });
        imageBytes += size;
        sections.push({ viewport: capture.viewport.name, name: section.name, selector: section.selector, file });
      } catch { omitted.push({ viewport: `${capture.viewport.name}/${section.name}`, reason: 'section screenshot unavailable' }); }
    }
  }
  const names = [...new Set([...required, ...approximate.keys(), ...(result.artDirection ? captured.keys() : [])])];
  for (const name of names) {
    const capture = captured.get(name)!;
    const file = `screenshots/${name}.png`;
    try {
      if (capture.documentSize.height > MAX_FULL_PAGE_HEIGHT && capture.sectionScreenshots.length > 0) {
        omitted.push({ viewport: name, reason: `full-page height ${capture.documentSize.height}px exceeds ${MAX_FULL_PAGE_HEIGHT}px; section screenshots retained` });
        continue;
      }
      const realFile = await fs.realpath(capture.screenshotPath);
      const relative = path.relative(realReportDir, realFile);
      if (relative.startsWith('..') || path.isAbsolute(relative) || path.extname(realFile).toLowerCase() !== '.png') throw new Error('Screenshot is outside the report');
      const size = (await fs.stat(realFile)).size;
      if (size > MAX_IMAGE_BYTES - imageBytes) { omitted.push({ viewport: name, reason: 'size limit' }); continue; }
      entries.push({ name: file, content: await fs.readFile(realFile) });
      imageBytes += size;
      included.push({ viewport: name, file, issueIds: visualIssues.filter((issue) => issue.viewports.includes(name)).map((issue) => issue.id), kind: 'full-page' });
    } catch {
      omitted.push({ viewport: name, reason: 'screenshot unavailable or size limit' });
    }
  }
  const manifest = {
    schemaVersion: 3,
    jobId: result.jobId, status: result.status, issueIds: issues.map((issue) => issue.id),
    bugIds: issues.filter((issue) => issue.id.startsWith('BUG-')).map((issue) => issue.id),
    candidateIds: issues.filter((issue) => issue.id.startsWith('CAND-')).map((issue) => issue.id),
    screenshotFiles: included, sectionFiles: sections, omittedScreenshots: omitted,
    approximateScreenshotMatches: included.flatMap((image) =>
      (approximate.get(image.viewport) ?? []).map((issueId) => ({ issueId, file: image.file, viewport: image.viewport }))),
    viewportContextScreenshotMatches: included.filter((image) => image.kind === 'full-page').flatMap((image) =>
      image.issueIds.map((issueId) => ({ issueId, file: image.file, viewport: image.viewport }))),
    artFiles: entries.map((entry) => entry.name).filter((name) => name.startsWith('art-direction-')),
    machineEvidenceFiles: entries.map((entry) => entry.name).filter((name) => name.startsWith('machine/')),
    visualIssuesWithoutExactScreenshot: visualIssues.filter((issue) => !exactResponsiveIds.has(issue.id)).map((issue) => issue.id),
    note: 'Security, SEO, runtime, performance and accessibility claims use machine evidence rather than generic screenshots. Only responsive-overflow repeat captures are marked as exact issue screenshots. Full-page and section images are viewport/section context, not exact defect localization; nearest-viewport matches remain approximate.',
  };
  entries.push({ name: 'evidence-manifest.json', content: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') });
  entries.push({ name: 'README.txt', content: Buffer.from(
    'VISUAL QA BROWSER — пакет для ручной передачи в GPT\n\n' +
    `1. Прикрепите этот ZIP к тому же сообщению, куда вставляете ${premiumPrompt ? 'gpt-fix-prompt.txt или gpt-premium-fix-prompt.txt' : 'gpt-fix-prompt.txt'}.\n` +
    '2. Проверьте, что GPT перечислил BUG-IDs из defects.json и открыл нужные screenshots. CAND-IDs из candidates.json проверяются, а не исправляются автоматически. Если интерфейс GPT не читает ZIP, загрузите файлы из него отдельно.\n' +
    '3. Для правки исходников также предоставьте GPT репозиторий/файлы вашего сайта. Проверка live URL не даёт доступ к вашим локальным CSS/React-файлам.\n' +
    '4. Посмотрите скриншоты перед отправкой: на странице могут быть личные данные. Этот пакет приложение никому автоматически не отправляет.\n' +
    '5. machine/ содержит response headers, axe failure evidence, runtime/network, site-technical данные, performance summary/raw core measurements и provenance. Не используйте screenshot как доказательство security/performance.\n' +
    '6. Пустые/пропущенные, контекстные и приблизительные screenshots перечислены в evidence-manifest.json. Full-page/section screenshots — контекст, а не точная локализация дефекта; exact-пометка используется только для подтверждённого responsive-overflow repeat capture. Очень высокие full-page PNG намеренно заменяются section screenshots.\n', 'utf8') });
  await fs.writeFile(path.join(reportDir, 'gpt-evidence.zip'), storedZip(entries));
}
