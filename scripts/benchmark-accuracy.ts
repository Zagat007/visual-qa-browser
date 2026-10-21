import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium, type Page } from 'playwright';
import { accuracyCases, type Signal } from '../benchmarks/accuracy-cases.js';
import { collectGeometryEvidence } from '../audit-engine/geometry/geometry.js';
import { collectImageEvidence } from '../audit-engine/visual/images.js';
import { collectTypographyEvidence } from '../audit-engine/visual/typography.js';

async function detect(page: Page, signal: Signal): Promise<{ actual: boolean; detail: string }> {
  if (signal === 'broken-img' || signal === 'duplicate-img-url' || signal === 'crop-candidate') {
    const images = await collectImageEvidence(page);
    const count = signal === 'broken-img' ? images.brokenImages : signal === 'duplicate-img-url' ? images.duplicateUrlGroups.length : images.cropCandidates;
    return { actual: count > 0, detail: `${signal}: count=${count}; sampled=${images.sampledImages}` };
  }
  if (signal === 'typography-h2-variant') {
    const h2 = (await collectTypographyEvidence(page)).groups.find((group) => group.role === 'H2');
    const count = h2?.variants.length ?? 0;
    return { actual: count > 1, detail: `rendered H2=${h2?.count ?? 0}; variants=${count}` };
  }
  const geometry = await collectGeometryEvidence(page);
  const matches = geometry.findings.filter((finding) => finding.rule === signal);
  return { actual: matches.length > 0, detail: `findings=${matches.length}; page overflow=${geometry.horizontalOverflowPx}px` };
}

function ratio(numerator: number, denominator: number): string { return denominator ? `${(numerator / denominator * 100).toFixed(1)}%` : 'N/A'; }

export async function runAccuracyBenchmark(destination: string): Promise<{ caseCount: number; totals: { tp: number; tn: number; fp: number; fn: number } }> {
const outDir = path.resolve(destination);
await fs.mkdir(path.join(outDir, 'screenshots'), { recursive: true });
const browser = await chromium.launch({ headless: true });
const rows: Array<{ id: string; signal: Signal; expected: boolean; actual: boolean; outcome: 'TP' | 'TN' | 'FP' | 'FN'; rationale: string; detail: string; screenshot: string }> = [];
try {
  for (const item of accuracyCases) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    try {
      await page.setContent(item.html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const detected = await detect(page, item.signal);
      const outcome = item.expected ? (detected.actual ? 'TP' : 'FN') : (detected.actual ? 'FP' : 'TN');
      const screenshot = `screenshots/${item.id}.png`;
      await page.screenshot({ path: path.join(outDir, screenshot), fullPage: true, animations: 'disabled' });
      rows.push({ id: item.id, signal: item.signal, expected: item.expected, actual: detected.actual, outcome,
        rationale: item.rationale, detail: detected.detail, screenshot });
    } finally { await page.close(); }
  }
  const signals = [...new Set(accuracyCases.map((item) => item.signal))];
  const summary = signals.map((signal) => {
    const selected = rows.filter((row) => row.signal === signal);
    const count = (outcome: string) => selected.filter((row) => row.outcome === outcome).length;
    const tp = count('TP'); const tn = count('TN'); const fp = count('FP'); const fn = count('FN');
    return { signal, total: selected.length, tp, tn, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) };
  });
  const totals = summary.reduce((sum, item) => ({ tp: sum.tp + item.tp, tn: sum.tn + item.tn, fp: sum.fp + item.fp, fn: sum.fn + item.fn }), { tp: 0, tn: 0, fp: 0, fn: 0 });
  const result = { scope: 'Controlled rendered HTML fixtures; collector-level signals, not end-to-end site defects',
    environment: { platform: os.platform(), node: process.version, chromium: browser.version(), viewport: '390x844, DPR 1' },
    caseCount: rows.length, summary, totals, overall: { precision: ratio(totals.tp, totals.tp + totals.fp), recall: ratio(totals.tp, totals.tp + totals.fn) }, rows };
  const caveat = 'Доли ниже описывают только эти заранее размеченные фикстуры. Они не оценивают точность на реальных сайтах, других viewport, в Windows и в непосещённых состояниях. Crop, typography variants, duplicate URLs и clipping остаются диагностическими CAND даже при точном обнаружении измеряемого сигнала.';
  const markdown = `# Контролируемая калибровка детекторов\n\nСреда: ${result.environment.platform}, Node ${result.environment.node}, Chromium ${result.environment.chromium}, ${result.environment.viewport}.\n\n${caveat}\n\nВсего ${rows.length} случаев: TP=${totals.tp}, TN=${totals.tn}, FP=${totals.fp}, FN=${totals.fn}; precision=${result.overall.precision}, recall=${result.overall.recall}.\n\n| Сигнал | Случаи | TP | TN | FP | FN | Precision | Recall |\n|---|---:|---:|---:|---:|---:|---:|---:|\n${summary.map((s) => `| ${s.signal} | ${s.total} | ${s.tp} | ${s.tn} | ${s.fp} | ${s.fn} | ${s.precision} | ${s.recall} |`).join('\n')}\n\n## Ошибки классификации\n\n${rows.filter((row) => row.outcome === 'FP' || row.outcome === 'FN').map((row) => `- ${row.outcome} ${row.id} (${row.signal}): ${row.rationale}; ${row.detail}; ${row.screenshot}`).join('\n') || 'На этом наборе ошибок классификации не обнаружено.'}\n\n## Реестр случаев\n\n| ID | Сигнал | Ожидание | Факт | Итог | Основание | Кадр |\n|---|---|---|---|---|---|---|\n${rows.map((row) => `| ${row.id} | ${row.signal} | ${row.expected ? 'да' : 'нет'} | ${row.actual ? 'да' : 'нет'} | ${row.outcome} | ${row.rationale} | [PNG](${row.screenshot}) |`).join('\n')}\n\n## Открытые пробелы\n\n- Нет разметки реальных страниц и оценки precision/recall на пользовательских сайтах.\n- Не проверены CSS background assets, реальные лица/кадрирование, контраст поверх изображения и семантическая уместность.\n- Отдельные сборщики evidence проверены непосредственно; классификация полного аудита и передача GPT покрыты другими тестами.\n- Итоги нельзя переносить между Linux и Windows без повторной калибровки на той же версии браузера и шрифтов.\n`;
  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'report.md'), markdown);
  process.stdout.write(`ACCURACY_BENCHMARK cases=${rows.length} TP=${totals.tp} TN=${totals.tn} FP=${totals.fp} FN=${totals.fn} precision=${result.overall.precision} recall=${result.overall.recall}\n${outDir}\n`);
  return { caseCount: rows.length, totals };
} finally { await browser.close(); }
}
