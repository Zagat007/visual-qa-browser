import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtDirectionConfiguration, ArtDirectionReview, AuditResult, CaptureEvidence } from '../shared/types.js';
import { containsLikelyPii, hasSensitivePathMarker, redactText, redactUrlForExternalEvidence } from '../privacy/redaction.js';
import { advisoryStatus, computeWeightedArtScore, enabledArtSubscores, filterAndNormalizeFindings } from './rubric.js';
import { buildArtDirectorInstructions, loadBrandProfile, ManualArtDirectorProvider, OpenAIArtDirectorProvider, type ArtEvidenceImage, type ArtEvidencePackage } from './provider.js';

function evenlySampleCaptures(captures: CaptureEvidence[], count: number): CaptureEvidence[] {
  if (captures.length <= count) return [...captures];
  if (count <= 1) return [captures[Math.floor((captures.length - 1) / 2)]!];
  const selected: CaptureEvidence[] = [];
  for (let index = 0; index < count; index += 1) {
    const position = Math.round((index * (captures.length - 1)) / (count - 1));
    const capture = captures[position];
    if (capture && !selected.includes(capture)) selected.push(capture);
  }
  return selected;
}

function imageCandidates(captures: CaptureEvidence[], mode: ArtDirectionConfiguration['mode']): ArtEvidenceImage[] {
  const limit = mode === 'ECONOMY' ? 8 : mode === 'STANDARD' ? 20 : 40;
  const fullPageBudget = Math.min(limit, mode === 'ECONOMY' ? 3 : mode === 'STANDARD' ? 6 : 10);
  const representative = evenlySampleCaptures(captures, Math.min(fullPageBudget, captures.length));
  const candidates: ArtEvidenceImage[] = representative.map((capture) => ({
    path: capture.screenshotPath,
    label: `${capture.viewport.name} full page`,
    viewport: capture.viewport.name,
    section: 'FULL_PAGE',
  }));
  let sectionIndex = 0;
  while (candidates.length < limit) {
    let added = false;
    for (const capture of representative) {
      const section = capture.sectionScreenshots[sectionIndex];
      if (!section) continue;
      candidates.push({ path: section.screenshotPath, label: `${capture.viewport.name} · ${section.name}`, viewport: capture.viewport.name, section: section.name });
      added = true;
      if (candidates.length >= limit) break;
    }
    if (!added) break;
    sectionIndex += 1;
  }
  const unique = new Map<string, ArtEvidenceImage>();
  for (const item of candidates) if (!unique.has(item.path)) unique.set(item.path, item);
  return [...unique.values()].slice(0, limit);
}

function sanitizedArtContext(context: CaptureEvidence['artContext']): CaptureEvidence['artContext'] {
  return {
    visibleText: redactText(context.visibleText),
    headings: context.headings.map((item) => ({ level: item.level, text: redactText(item.text) })),
    ctas: context.ctas.map((item) => ({ text: redactText(item.text), selector: redactText(item.selector) })),
    sections: context.sections.map((section) => ({
      ...section,
      selector: redactText(section.selector),
      heading: redactText(section.heading),
      visibleText: redactText(section.visibleText),
      ctas: section.ctas.map((item) => redactText(item)),
    })),
  };
}

async function buildEvidencePackage(rootDir: string, result: AuditResult, config: ArtDirectionConfiguration): Promise<ArtEvidencePackage> {
  const brandProfile = await loadBrandProfile(rootDir, result.requestedUrl, config.siteProfile);
  return {
    version: 1, requestedUrl: redactUrlForExternalEvidence(result.requestedUrl), generatedAt: new Date().toISOString(), mode: config.mode, layers: config.layers,
    brandProfile,
    captures: result.captures.map((capture) => {
      const artContext = sanitizedArtContext(capture.artContext);
      return {
        viewport: capture.viewport.name, width: capture.viewport.width, height: capture.viewport.height, pageUrl: redactUrlForExternalEvidence(capture.finalUrl),
        title: redactText(capture.title), visibleText: artContext.visibleText, headings: artContext.headings, ctas: artContext.ctas,
        sections: artContext.sections, imageMetrics: { ...capture.images, duplicateUrlGroups: capture.images.duplicateUrlGroups.map((group) => ({ ...group, url: redactUrlForExternalEvidence(group.url) })), metrics: capture.images.metrics.map((metric) => ({ ...metric, src: redactUrlForExternalEvidence(metric.src), currentSrc: redactUrlForExternalEvidence(metric.currentSrc) })) }, typography: capture.typography, geometryFindings: capture.geometry.findings,
      };
    }),
    images: imageCandidates(result.captures, config.mode),
    technicalContext: { technicalStatus: result.status, incompleteCoverage: result.coverage.incompleteReasons.map((item) => redactText(item)) },
  };
}

function htmlEscape(value: string): string { return value.replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char] ?? char)); }

async function writeImageReviewBoard(outputDir: string, evidence: ArtEvidencePackage): Promise<string> {
  const boardPath = path.join(outputDir, 'image-review-board.html');
  const cards: string[] = [];
  for (const image of evidence.images) {
    const relative = path.relative(outputDir, image.path).replaceAll('\\', '/');
    if (relative.startsWith('../')) continue;
    const search = `${image.section} ${image.viewport} ${image.label}`.toLowerCase();
    cards.push(`<figure data-viewport="${htmlEscape(image.viewport)}" data-section="${htmlEscape(image.section)}" data-search="${htmlEscape(search)}"><img src="${htmlEscape(relative)}" loading="lazy"><figcaption><strong>${htmlEscape(image.section)}</strong><span>${htmlEscape(image.viewport)}</span></figcaption></figure>`);
  }
  const viewports = [...new Set(evidence.images.map((image) => image.viewport))].sort();
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Image Review Board</title><style>body{margin:0;background:#0b0c10;color:#f5f5f5;font-family:system-ui;padding:24px}h1{font-size:28px}.tools{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.tools input,.tools select{padding:10px 12px;border:1px solid #343743;border-radius:10px;background:#15171d;color:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}figure{margin:0;background:#15171d;border:1px solid #2b2e38;border-radius:14px;overflow:hidden}img{width:100%;height:240px;object-fit:cover;display:block}figcaption{padding:12px;display:flex;justify-content:space-between;gap:12px;font-size:12px;color:#bbb}strong{color:#fff}.meta{color:#9da3b4;font-size:13px}</style><h1>IMAGE REVIEW BOARD</h1><p>Сводный визуальный board для поиска повторов, монотонности, crop-проблем и quality gaps.</p><p class="meta">Target: ${htmlEscape(evidence.requestedUrl)} · Images: ${cards.length}</p><div class="tools"><input id="q" type="search" placeholder="Поиск секции"><select id="vp"><option value="">Все viewport</option>${viewports.map((viewport) => `<option>${htmlEscape(viewport)}</option>`).join('')}</select><span id="count">${cards.length}</span></div><div class="grid">${cards.join('')}</div><script>const q=document.getElementById('q'),vp=document.getElementById('vp'),cards=[...document.querySelectorAll('figure[data-viewport]')],count=document.getElementById('count');function filter(){const text=(q.value||'').toLowerCase().trim(),v=vp.value||'';let n=0;for(const card of cards){const show=(!text||(card.dataset.search||'').includes(text))&&(!v||card.dataset.viewport===v);card.style.display=show?'':'none';if(show)n++;}count.textContent='Показано: '+n;}q.addEventListener('input',filter);vp.addEventListener('change',filter);filter();</script></html>`;
  await fs.writeFile(boardPath, html, 'utf8');
  return boardPath;
}

function emptySubscores(): ArtDirectionReview['subscores'] { return { visualHierarchy:null, typography:null, spacingRhythm:null, imageQuality:null, imageSemanticFit:null, imageVariety:null, composition:null, brandConsistency:null, premiumPerception:null, conversionPresentation:null }; }

export async function runArtDirectionReview(rootDir: string, outputDir: string, baseResult: AuditResult, config: ArtDirectionConfiguration, signal?: AbortSignal): Promise<ArtDirectionReview> {
  signal?.throwIfAborted();
  const evidence = await buildEvidencePackage(rootDir, baseResult, config);
  const evidencePath = path.join(outputDir, 'art-direction-evidence.json');
  const manualPromptPath = path.join(outputDir, 'art-direction-prompt.txt');
  signal?.throwIfAborted();
  const boardPath = await writeImageReviewBoard(outputDir, evidence);
  const persistedEvidence = { ...evidence, images: evidence.images.map((image) => ({ ...image, path: path.relative(outputDir, image.path).replaceAll('\\', '/') })) };
  await fs.writeFile(evidencePath, `${JSON.stringify(persistedEvidence, null, 2)}\n`, 'utf8');
  await fs.writeFile(manualPromptPath, `${buildArtDirectorInstructions(evidence)}\n`, 'utf8');

  const provider = config.provider === 'OPENAI' ? new OpenAIArtDirectorProvider() : new ManualArtDirectorProvider();
  const uniquePages = new Set(evidence.captures.map((capture) => capture.pageUrl));
  const evidenceLimitations = [
    'AI Art Direction is advisory and never changes the technical PASS/FAIL verdict.',
    'Scores are rubric-based professional evaluations, not objective measurements.',
    'Screenshot-level PII blur is not implemented; external AI is blocked on private/token-like URLs and likely DOM PII, but visually embedded PII on public screenshots remains a residual privacy risk.',
    ...(config.layers.includes('CROSS_PAGE') && uniquePages.size < 2
      ? ['Cross-page review NOT VERIFIED: this live audit supplied evidence for only one page URL.']
      : []),
    ...(config.layers.includes('CROSS_SECTION') && evidence.captures.every((capture) => capture.sections.length < 2)
      ? ['Cross-section review PARTIAL: fewer than two semantic sections were discovered in the available evidence.']
      : []),
  ];
  const base: Omit<ArtDirectionReview, 'status' | 'overallScore' | 'subscores' | 'sectionScores' | 'findings' | 'rootCauses'> = {
    enabled: true, provider: config.provider, providerModel: provider.model, mode: config.mode, advisoryOnly: true,
    externalAnalysis: config.provider === 'OPENAI', evidencePackagePath: path.basename(evidencePath), manualPromptPath: path.basename(manualPromptPath), imageReviewBoardPath: path.basename(boardPath),
    limitations: evidenceLimitations,
  };
  if (config.provider === 'MANUAL') return { ...base, status:'NOT_CONFIGURED', overallScore:null, subscores:emptySubscores(), sectionScores:[], findings:[], rootCauses:[], limitations:[...base.limitations, 'Manual mode: evidence package is ready for ChatGPT; no automatic AI score was generated.'] };
  if (!provider.configured) return { ...base, status:'NOT_CONFIGURED', externalAnalysis:false, overallScore:null, subscores:emptySubscores(), sectionScores:[], findings:[], rootCauses:[], error:'OPENAI_API_KEY and OPENAI_ART_DIRECTOR_MODEL must both be configured.', limitations:[...base.limitations, 'External AI provider is not configured.'] };
  if (hasSensitivePathMarker(baseResult.requestedUrl)) return { ...base, status:'PARTIAL', externalAnalysis:false, overallScore:null, subscores:emptySubscores(), sectionScores:[], findings:[], rootCauses:[], error:'External AI upload blocked: target URL looks like a private/magic-link surface.', limitations:[...base.limitations, 'Private/authenticated or token-like surfaces are not eligible for external AI review in v1.1. Use Manual/ChatGPT export locally.'] };
  const likelyPii = evidence.captures.some((capture) => containsLikelyPii([capture.visibleText, ...capture.sections.map((section) => section.visibleText), ...capture.ctas.map((cta) => cta.text)].join(' ')));
  if (likelyPii) return { ...base, status:'PARTIAL', externalAnalysis:false, overallScore:null, subscores:emptySubscores(), sectionScores:[], findings:[], rootCauses:[], error:'External AI upload blocked by privacy firewall: likely email/phone PII was detected in rendered DOM evidence.', limitations:[...base.limitations, 'External multimodal upload was not performed because likely PII was detected. Use Manual/ChatGPT export or remove/redact the sensitive content first.'] };
  try {
    signal?.throwIfAborted();
    const payload = await provider.review(evidence, config, signal);
    const normalized = filterAndNormalizeFindings(payload, config.layers);
    const partialCoverage = evidenceLimitations.some((item) => item.includes('NOT VERIFIED') || item.includes('PARTIAL'));
    return { ...base, status: partialCoverage ? 'PARTIAL' : advisoryStatus(normalized.findings), overallScore:computeWeightedArtScore(payload.subscores, config.layers), subscores:enabledArtSubscores(payload.subscores, config.layers), sectionScores:payload.sectionScores, findings:normalized.findings, rootCauses:normalized.rootCauses, limitations:[...base.limitations, ...(computeWeightedArtScore(payload.subscores, config.layers) === null ? ['Overall Art Direction score is N/A because the selected layers contain no weighted score dimensions.'] : ['Overall Art Direction score is normalized only across the weighted dimensions enabled in this run.']), ...payload.limitations] };
  } catch (error) {
    signal?.throwIfAborted();
    return { ...base, status:'FAILED', overallScore:null, subscores:emptySubscores(), sectionScores:[], findings:[], rootCauses:[], error:redactText(error instanceof Error ? error.message : 'AI Art Director failed.'), limitations:[...base.limitations, 'Provider failure is isolated: technical QA results remain valid within their own coverage.'] };
  }
}
