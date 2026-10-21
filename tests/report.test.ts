import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import { writeReport } from '../audit-engine/reporting/report';
import type { AuditResult } from '../audit-engine/shared/types';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('report writer', () => {
  it('writes escaped HTML and JSON evidence outputs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-report-'));
    tempDirs.push(root);
    const reportAbsolutePath = path.join(root, 'report.html');
    const screenshotPath = path.join(root, 'screenshots', 'desktop-1440.png');
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await fs.writeFile(screenshotPath, 'placeholder');

    const result: AuditResult = {
      jobId: 'job-test',
      requestedUrl: 'https://example.com/?unknown=must-not-leak&token=must-not-leak-either#private-fragment',
      preset: 'QUICK',
      configuration: { mode: 'FULL', modules: ['VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'RUNTIME', 'ACCESSIBILITY', 'SEO', 'SECURITY'], viewportPreset: 'QUICK' },
      startedAt: '2026-10-01T00:00:00.000Z',
      finishedAt: '2026-10-01T00:00:01.000Z',
      status: 'PASS',
      safeMode: true,
      metadata: { appVersion: '1.1.9', sourceTreeHash: 'a'.repeat(64), sourceFileCount: 42, configHash: 'b'.repeat(64), packageLockHash: 'c'.repeat(64), gitCommit: 'deadbeef', gitDirty: false, browserVersion: 'Chromium test', nodeVersion: '22.19.0', os: { platform: 'win32', release: 'test', arch: 'x64' } },
      coverage: {
        fullPassEligible: true,
        incompleteReasons: [],
        truncatedEvidenceSources: [],
        requestedViewports: 1,
        completedViewports: 1,
        failedViewports: 0,
        sectionScreenshots: 0,
        skippedSafelyRequests: 0,
        policyBlockedRequests: 0,
        validationFailedRequests: 0,
        responsiveSweepSamples: 0,
        interactionViewports: 0,
        interactionCandidates: 0,
        interactionsTested: 0,
        interactionsSkippedSafely: 0,
        formFieldsInspected: 0,
      },
      captures: [{
        viewport: { name: 'desktop-1440', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, orientation: 'landscape' },
        deviceContext: { userAgent: 'test', devicePixelRatio: 1, orientationType: 'landscape-primary', orientationAngle: 0, pointerFine: true, pointerCoarse: false, hoverCapable: true, anyHoverCapable: true },
        screenshotPath,
        screenshotBytes: 11,
        captureAttempts: 1,
        capturedAt: '2026-10-01T00:00:00.500Z',
        sectionScreenshots: [],
        title: '<script>alert(1)</script>',
        finalUrl: 'https://example.com/page?opaque=page-secret#capture-fragment',
        httpStatus: 200,
        documentSize: { width: 1440, height: 1800 },
        stabilization: {
          fontsReady: true,
          imagesReady: true,
          imageCount: 2,
          brokenImageCount: 0,
          lazyLoadWarmup: true,
          networkIdleObserved: true,
          layoutStable: true,
          animationsControlled: true,
        },
        geometry: { viewportWidth: 1440, viewportHeight: 900, documentScrollWidth: 1460, documentScrollHeight: 1800, horizontalOverflowPx: 20, elementsScanned: 10, elementsTruncated: false, overlapPairsScanned: 0, findings: [{ rule: 'horizontal-overflow', severity: 'P2', confidence: 'HIGH', message: 'document is 20px wider than viewport' }], stickyFixed: [], stackingContexts: [], sectionGaps: [] },
        typography: { groups: [{ role: 'H1', count: 1, variants: [{ fontFamily: 'Inter', fontSize: '32px', fontWeight: '700', lineHeight: '38px', letterSpacing: '0px', textTransform: 'none', textAlign: 'left', count: 1, sampleSelectors: ['h1'] }] }] },
        images: { totalImages: 2, sampledImages: 2, truncated: false, brokenImages: 0, cropCandidates: 0, duplicateUrlGroups: [], metrics: [] },
        accessibility: { auditStatus: 'PASS', engine: 'axe-core', version: 'test', automatedOnly: true, violationCount: 0, incompleteCount: 0, passCount: 1, inapplicableCount: 0, violations: [], incomplete: [] },
        seo: { auditStatus: 'PASS', title: 'Example', description: 'Description', canonical: 'https://example.com/', robots: '', viewport: 'width=device-width', lang: 'en', openGraph: { title: '', description: '', image: '', url: '', type: '' }, twitter: { card: '', title: '', description: '', image: '' }, h1Count: 1, headings: [{ level: 1, text: 'Example' }], headingJumps: [], noindex: false, findings: [] },
        delivery: { auditStatus: 'PASS', finalUrl: 'https://example.com/', status: 200, headers: { 'content-type': 'text/html' }, setCookieCount: 0, cookieFlagSummary: { missingSecure: 0, missingHttpOnly: 0, missingSameSite: 0 }, findings: [] },
        runtime: { console: [], pageErrors: [], network: [{ kind: 'http-error', method: 'GET', url: 'https://example.com/failure?opaque=network-secret#network-fragment', status: 503, resourceType: 'document' }], limits: { consoleDropped: 0, pageErrorsDropped: 0, networkDropped: 0 } },
        artContext: { visibleText: 'Example CTA', headings: [{ level: 1, text: 'Example' }], ctas: [{ text: 'Buy', selector: 'button' }], sections: [] },
      }],
      captureFailures: [],
      responsiveSweep: null,
      responsiveSweepFailure: null,
      interactionAudits: [],
      interactionFailures: [],
      siteTechnical: null,
      siteTechnicalFailure: null,
      artDirection: {
        enabled: true,
        status: 'ISSUE',
        provider: 'OPENAI',
        providerModel: 'test-model',
        mode: 'STANDARD',
        advisoryOnly: true,
        externalAnalysis: true,
        overallScore: 84,
        subscores: { visualHierarchy: 86, typography: 88, spacingRhythm: 82, imageQuality: 84, imageSemanticFit: 80, imageVariety: 75, composition: 85, brandConsistency: 87, premiumPerception: 83, conversionPresentation: 82 },
        sectionScores: [],
        findings: [{ artId: 'ART-001', rootCauseKey: 'image variety', rootCauseId: 'ROOT-ART-01', page: '/', section: 'Hero', viewport: 'desktop-1440', category: 'IMAGE_VARIETY', score: 74, confidence: 'HIGH', priority: 'SHOULD_CONSIDER', observation: 'Hero repeats the same image treatment used below. <script>artAttack()</script>', evidence: ['Two major sections use a similar centered portrait.'], impact: 'Storytelling becomes repetitive.', recommendation: 'Use a different environmental composition for one section.', implementationHint: 'Replace the Hero asset or use a materially different crop.', expectedImprovement: 'More visual variety while preserving the design system.', alternatives: [{ label: 'Minimal', description: 'Change object-position only if a stronger crop exists.', recommended: true }], status: 'OPEN' }],
        rootCauses: [{ id: 'ROOT-ART-01', key: 'image variety', title: 'Repeated image treatment', findingIds: ['ART-001'] }],
        evidencePackagePath: path.join(root, 'art-direction-evidence.json'),
        manualPromptPath: path.join(root, 'art-direction-prompt.txt'),
        imageReviewBoardPath: path.join(root, 'image-review-board.html'),
        limitations: ['Advisory only.'],
      },
      reportRelativePath: 'example/report.html',
      reportAbsolutePath,
      notes: ['Phase test'],
    };

    await writeReport(result);

    const html = await fs.readFile(reportAbsolutePath, 'utf8');
    const json = JSON.parse(await fs.readFile(path.join(root, 'summary.json'), 'utf8')) as AuditResult;
    const defects = JSON.parse(await fs.readFile(path.join(root, 'defects.json'), 'utf8')) as Array<{ id: string; hypothesisGroupId: string; severity: string; rule: string }>;
    const rootCauses = JSON.parse(await fs.readFile(path.join(root, 'root-cause-hypotheses.json'), 'utf8')) as Array<{ id: string; issueIds: string[] }>;
    const gptPrompt = await fs.readFile(path.join(root, 'gpt-fix-prompt.txt'), 'utf8');
    const premiumPrompt = await fs.readFile(path.join(root, 'gpt-premium-fix-prompt.txt'), 'utf8');
    const zip = await fs.readFile(path.join(root, 'gpt-evidence.zip'));
    const contents = new Map<string, Buffer>();
    for (let offset = 0; zip.readUInt32LE(offset) === 0x04034b50;) {
      const size = zip.readUInt32LE(offset + 18);
      const nameLength = zip.readUInt16LE(offset + 26);
      const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
      const start = offset + 30 + nameLength;
      contents.set(name, zip.subarray(start, start + size));
      offset = start + size;
    }
    const manifest = JSON.parse(contents.get('evidence-manifest.json')!.toString()) as { schemaVersion: number; issueIds: string[]; bugIds: string[]; candidateIds: string[]; screenshotFiles: Array<{ file: string; issueIds: string[] }>; viewportContextScreenshotMatches: Array<{ issueId: string; file: string; viewport: string }>; visualIssuesWithoutExactScreenshot: string[] };
    expect(html).toContain('Visual QA Browser — отчёт аудита');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;artAttack()&lt;/script&gt;');
    expect(html).toContain('84/100 · 8.4/10');
    expect(html).toContain('policy-blocked requests: 0');
    expect(html).toContain('Копировать технические дефекты');
    expect(html).toContain('Technical + Art → ChatGPT');
    expect(html).toContain('gpt-evidence.zip');
    expect(html).toContain('Находки BUG и кандидаты CAND');
    expect(defects).toHaveLength(2);
    expect(defects[0]).toMatchObject({ id: 'BUG-001', severity: 'P0', rule: 'http-error' });
    expect(defects[0]?.hypothesisGroupId).toMatch(/^HYP-/);
    expect(defects[1]?.rule).toBe('horizontal-overflow');
    expect(rootCauses.length).toBe(2);
    expect(rootCauses.flatMap((cluster) => cluster.issueIds)).toEqual(expect.arrayContaining(['BUG-001', 'BUG-002']));
    expect(gptPrompt).toContain('ЗАДАНИЕ ДЛЯ CHATGPT НА ИСПРАВЛЕНИЕ САЙТА');
    expect(gptPrompt).toContain('Целевой сайт: https://example.com/');
    expect(gptPrompt).not.toContain('must-not-leak');
    expect(gptPrompt).not.toContain('private-fragment');
    expect(gptPrompt).not.toContain('page-secret');
    expect(gptPrompt).not.toContain('network-secret');
    expect(JSON.stringify(defects)).not.toContain('network-secret');
    expect(gptPrompt).toContain('BUG-001 | P0');
    expect(gptPrompt).toContain('Прикрепите gpt-evidence.zip');
    expect(gptPrompt).toContain('Всего 2; подтверждено 2;');
    expect(gptPrompt).toContain('не доказанная первопричина): HYP-');
    expect(premiumPrompt).toContain('AI ART DIRECTOR — ADVISORY LAYER');
    expect(premiumPrompt).toContain('ART-001');
    expect(html).toContain('artPriorityFilter');
    expect(html).toContain('Принять');
    expect(await fs.readFile(path.join(root, 'art-direction.json'), 'utf8')).toContain('ART-001');
    expect(json.jobId).toBe('job-test');
    expect(json.captures).toHaveLength(1);
    expect(manifest.issueIds).toEqual(defects.map((issue) => issue.id));
    expect(manifest.bugIds).toEqual(defects.map((issue) => issue.id));
    expect(manifest.candidateIds).toEqual([]);
    expect(JSON.parse(contents.get('candidates.json')!.toString())).toEqual([]);
    expect(manifest.screenshotFiles[0]).toMatchObject({ file: 'screenshots/desktop-1440.png', issueIds: ['BUG-002'] });
    expect(manifest.schemaVersion).toBe(3);
    expect(manifest.viewportContextScreenshotMatches).toContainEqual({ issueId: 'BUG-002', file: 'screenshots/desktop-1440.png', viewport: 'desktop-1440' });
    expect(manifest.visualIssuesWithoutExactScreenshot).toContain('BUG-002');
    expect(contents.has('machine/security-delivery.json')).toBe(true);
    expect(contents.has('machine/accessibility.json')).toBe(true);
    expect(contents.has('machine/runtime.json')).toBe(true);
    expect(contents.has('machine/provenance.json')).toBe(true);
    expect(contents.get('screenshots/desktop-1440.png')?.toString()).toBe('placeholder');
    expect(JSON.parse(contents.get('defects.json')!.toString())).toEqual(defects);
    expect(contents.get('gpt-fix-prompt.txt')?.toString()).toBe(gptPrompt);
    expect(contents.get('defects.json')?.toString()).not.toContain('network-secret');
    expect(contents.get('gpt-fix-prompt.txt')?.toString()).not.toContain('must-not-leak');

    const scoped: AuditResult = {
      ...result,
      configuration: { mode: 'VISUAL', modules: ['VISUAL'], viewportPreset: 'QUICK' },
      artDirection: null,
      reportAbsolutePath: path.join(root, 'visual-only', 'report.html'),
      captures: [{ ...result.captures[0]!, screenshotPath: path.join(root, 'missing.png') }],
    };
    await writeReport(scoped);
    const scopedDefects = JSON.parse(await fs.readFile(path.join(root, 'visual-only', 'defects.json'), 'utf8')) as Array<{ rule: string; id: string }>;
    expect(scopedDefects).toHaveLength(1);
    expect(scopedDefects[0]?.rule).toBe('horizontal-overflow');
    const scopedZip = await fs.readFile(path.join(root, 'visual-only', 'gpt-evidence.zip'));
    expect(scopedZip.includes(Buffer.from('screenshot unavailable or size limit'))).toBe(true);
    expect(scopedZip.includes(Buffer.from('screenshots/desktop-1440.png'))).toBe(false);

    await expect(fs.stat(path.join(root, 'visual-only', 'gpt-premium-fix-prompt.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(scopedZip.includes(Buffer.from('gpt-premium-fix-prompt.txt'))).toBe(false);

    const accessibilityOnly: AuditResult = {
      ...result,
      configuration: { mode: 'FULL', modules: ['ACCESSIBILITY'], viewportPreset: 'QUICK' },
      artDirection: null,
      reportAbsolutePath: path.join(root, 'accessibility-only', 'report.html'),
      captures: [{
        ...result.captures[0]!,
        geometry: { ...result.captures[0]!.geometry, horizontalOverflowPx: 0, findings: [] },
        runtime: { console: [], pageErrors: [], network: [], limits: { consoleDropped: 0, pageErrorsDropped: 0, networkDropped: 0 } },
        accessibility: {
          auditStatus: 'ISSUE', engine: 'axe-core', version: 'test', automatedOnly: true, violationCount: 1, incompleteCount: 0, passCount: 0, inapplicableCount: 0,
          violations: [{ id: 'button-name', impact: 'critical', tags: ['wcag2a'], help: 'Buttons must have discernible text', helpUrl: 'https://example.com/help', nodes: [{ target: ['button.icon-only'], failureSummary: 'Fix the button accessible name' }] }],
          incomplete: [],
        },
      }],
    };
    await writeReport(accessibilityOnly);
    const accessibilityZip = await fs.readFile(path.join(root, 'accessibility-only', 'gpt-evidence.zip'));
    expect(accessibilityZip.includes(Buffer.from('machine/accessibility.json'))).toBe(true);
    expect(accessibilityZip.includes(Buffer.from('screenshots/desktop-1440.png'))).toBe(false);

    const advisoryOnly: AuditResult = {
      ...result,
      configuration: { mode: 'CUSTOM', modules: ['SEO', 'SECURITY'], viewportPreset: 'QUICK' },
      artDirection: null,
      reportAbsolutePath: path.join(root, 'advisory-only', 'report.html'),
      captures: [{
        ...result.captures[0]!,
        seo: { ...result.captures[0]!.seo, auditStatus: 'ISSUE', findings: [{ rule: 'missing-description', severity: 'P3', message: 'Meta description is missing.' }] },
        delivery: { ...result.captures[0]!.delivery, auditStatus: 'ISSUE', findings: [{ rule: 'missing-csp', severity: 'P3', message: 'Content-Security-Policy header is missing.' }] },
      }],
    };
    await writeReport(advisoryOnly);
    expect(JSON.parse(await fs.readFile(path.join(root, 'advisory-only', 'defects.json'), 'utf8'))).toEqual([]);
    const advisoryCandidates = JSON.parse(await fs.readFile(path.join(root, 'advisory-only', 'candidates.json'), 'utf8')) as Array<{ rule: string; state: string }>;
    expect(advisoryCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'missing-description', state: 'ТРЕБУЕТ ПРОВЕРКИ' }),
      expect.objectContaining({ rule: 'missing-csp', state: 'ТРЕБУЕТ ПРОВЕРКИ' }),
    ]));

    const tallDir = path.join(root, 'tall');
    const tallFull = path.join(tallDir, 'screenshots', 'desktop-1440.png');
    const tallSection = path.join(tallDir, 'sections', 'hero.png');
    await fs.mkdir(path.dirname(tallFull), { recursive: true });
    await fs.mkdir(path.dirname(tallSection), { recursive: true });
    await fs.writeFile(tallFull, 'very-tall-full-page');
    await fs.writeFile(tallSection, 'localized-section');
    const tall: AuditResult = {
      ...scoped,
      reportAbsolutePath: path.join(tallDir, 'report.html'),
      captures: [{
        ...result.captures[0]!,
        screenshotPath: tallFull,
        screenshotBytes: 19,
        documentSize: { width: 1440, height: 35_084 },
        sectionScreenshots: [{ name: 'Hero', selector: 'main > section:nth-of-type(1)', screenshotPath: tallSection }],
      }],
    };
    await writeReport(tall);
    const tallZip = await fs.readFile(path.join(tallDir, 'gpt-evidence.zip'));
    expect(tallZip.includes(Buffer.from('sections/desktop-1440/01.png'))).toBe(true);
    expect(tallZip.includes(Buffer.from('screenshots/desktop-1440.png'))).toBe(false);
    expect(tallZip.includes(Buffer.from('full-page height 35084px exceeds 16000px; section screenshots retained'))).toBe(true);

    const candidate: AuditResult = {
      ...scoped,
      reportAbsolutePath: path.join(root, 'candidates', 'report.html'),
      captures: [{
        ...result.captures[0]!, geometry: {
          ...result.captures[0]!.geometry, horizontalOverflowPx: 0,
          findings: [
            { rule: 'overlap-candidate', severity: 'P2', confidence: 'HIGH', message: 'Bounding rectangles intersect' },
            { rule: 'clipping-candidate', severity: 'P2', confidence: 'HIGH', message: 'Potential intentional clipping' },
          ],
        },
      }],
    };
    await writeReport(candidate);
    const candidateDefects = JSON.parse(await fs.readFile(path.join(root, 'candidates', 'defects.json'), 'utf8')) as unknown[];
    const candidateIssues = JSON.parse(await fs.readFile(path.join(root, 'candidates', 'candidates.json'), 'utf8')) as Array<{ id: string; rule: string; state: string }>;
    expect(candidateDefects).toEqual([]);
    expect(candidateIssues).toHaveLength(2);
    expect(candidateIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'overlap-candidate', state: 'ТРЕБУЕТ ПРОВЕРКИ' }),
      expect.objectContaining({ rule: 'clipping-candidate', state: 'ТРЕБУЕТ ПРОВЕРКИ' }),
    ]));
    const candidatePrompt = await fs.readFile(path.join(root, 'candidates', 'gpt-fix-prompt.txt'), 'utf8');
    expect(candidatePrompt).toContain('Всего 2; подтверждено 0; автоматические находки 0; требуют проверки 2');
    expect(candidatePrompt).toContain('КАНДИДАТЫ CAND — ТОЛЬКО ДЛЯ ПРОВЕРКИ (2)');
    expect(candidatePrompt).toContain('CAND-001');
    const candidateZip = await fs.readFile(path.join(root, 'candidates', 'gpt-evidence.zip'));
    expect(candidateZip.includes(Buffer.from('candidates.json'))).toBe(true);
    expect(candidateZip.includes(Buffer.from('"candidateIds": [\n    "CAND-001"'))).toBe(true);

    const cropMetric = {
      selector: '.hero img', rect: { x: 0, y: 0, width: 600, height: 300 },
      src: 'https://example.com/hero.jpg', currentSrc: 'https://example.com/hero.jpg',
      naturalWidth: 1600, naturalHeight: 1200, renderedWidth: 600, renderedHeight: 300,
      intrinsicAspectRatio: 4 / 3, renderedAspectRatio: 2, aspectRatioDeltaPct: 50,
      objectFit: 'cover', objectPosition: '50% 50%', loading: 'eager', complete: true, broken: false, cropCandidate: true,
    } as const;
    const dedupe: AuditResult = {
      ...scoped,
      reportAbsolutePath: path.join(root, 'dedupe', 'report.html'),
      captures: [
        { ...result.captures[0]!, geometry: { ...result.captures[0]!.geometry, horizontalOverflowPx: 0, findings: [] }, images: { totalImages: 1, sampledImages: 1, truncated: false, brokenImages: 0, cropCandidates: 1, duplicateUrlGroups: [], metrics: [cropMetric] }, runtime: { ...result.captures[0]!.runtime, network: [] } },
        { ...result.captures[0]!, viewport: { ...result.captures[0]!.viewport, name: 'mobile-390', width: 390, height: 844, isMobile: true, hasTouch: true, orientation: 'portrait' }, geometry: { ...result.captures[0]!.geometry, viewportWidth: 390, viewportHeight: 844, documentScrollWidth: 390, horizontalOverflowPx: 0, findings: [] }, images: { totalImages: 1, sampledImages: 1, truncated: false, brokenImages: 0, cropCandidates: 1, duplicateUrlGroups: [], metrics: [cropMetric] }, runtime: { ...result.captures[0]!.runtime, network: [] } },
      ],
    };
    await writeReport(dedupe);
    const dedupeCandidates = JSON.parse(await fs.readFile(path.join(root, 'dedupe', 'candidates.json'), 'utf8')) as Array<{ rule: string; viewports: string[]; evidence: string }>;
    const cropCandidates = dedupeCandidates.filter((issue) => issue.rule === 'image-crop-candidate');
    expect(cropCandidates).toHaveLength(1);
    expect(cropCandidates[0]?.viewports).toEqual(expect.arrayContaining(['desktop-1440', 'mobile-390']));
    expect(cropCandidates[0]?.evidence).toContain('.hero img');

    const responsiveScreenshot = path.join(root, 'responsive-only', 'screenshots', 'desktop-1440.png');
    const exactResponsiveScreenshot = path.join(root, 'responsive-only', 'responsive', 'width-320.png');
    await fs.mkdir(path.dirname(responsiveScreenshot), { recursive: true });
    await fs.copyFile(screenshotPath, responsiveScreenshot);
    await fs.mkdir(path.dirname(exactResponsiveScreenshot), { recursive: true });
    await fs.copyFile(screenshotPath, exactResponsiveScreenshot);
    const responsiveOnly: AuditResult = {
      ...result,
      status: 'ISSUE',
      configuration: { mode: 'RESPONSIVE', modules: ['RESPONSIVE'], viewportPreset: 'QUICK' },
      artDirection: null,
      reportAbsolutePath: path.join(root, 'responsive-only', 'report.html'),
      captures: [{ ...result.captures[0]!, screenshotPath: responsiveScreenshot, geometry: { ...result.captures[0]!.geometry, horizontalOverflowPx: 0, findings: [] }, runtime: { ...result.captures[0]!.runtime, network: [] } }],
      responsiveSweep: {
        start: 320, end: 420, step: 50, height: 900, widthOnly: true,
        samples: [], findings: [{ rule: 'responsive-overflow', confidence: 'HIGH', fromWidth: 320, toWidth: 320, message: 'overflow at narrow widths', verification: {
          status: 'CONFIRMED', width: 320, measuredOverflowPx: 12, screenshotPath: exactResponsiveScreenshot,
          capturedAt: '2026-10-01T00:00:00.500Z', finalUrl: 'https://example.com/',
        } }],
        unstableWidths: [], policyBlockedRequests: 0, validationFailedRequests: 0,
      },
    };
    await writeReport(responsiveOnly);
    const responsiveDefects = JSON.parse(await fs.readFile(path.join(root, 'responsive-only', 'defects.json'), 'utf8')) as Array<{ id: string; rule: string }>;
    expect(responsiveDefects).toEqual([expect.objectContaining({ id: 'BUG-001', rule: 'responsive-overflow' })]);
    const responsiveZip = await fs.readFile(path.join(root, 'responsive-only', 'gpt-evidence.zip'));
    expect(responsiveZip.includes(Buffer.from('responsive/width-320.png'))).toBe(true);
    expect(responsiveZip.includes(Buffer.from('"visualIssuesWithoutExactScreenshot": []'))).toBe(true);

    const notReproduced: AuditResult = {
      ...responsiveOnly,
      reportAbsolutePath: path.join(root, 'not-reproduced', 'report.html'),
      responsiveSweep: { ...responsiveOnly.responsiveSweep!, findings: [{
        rule: 'responsive-overflow', confidence: 'HIGH', fromWidth: 320, toWidth: 320,
        message: 'initial overflow', verification: { status: 'NOT_REPRODUCED', width: 320, measuredOverflowPx: 0, reason: 'No repeat' },
      }] },
    };
    await writeReport(notReproduced);
    expect(JSON.parse(await fs.readFile(path.join(root, 'not-reproduced', 'defects.json'), 'utf8'))).toEqual([]);
    expect(JSON.parse(await fs.readFile(path.join(root, 'not-reproduced', 'candidates.json'), 'utf8'))).toEqual([expect.objectContaining({ id: 'CAND-001', rule: 'responsive-overflow' })]);

    const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.com/report.html' });
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } } });
    dom.window.document.execCommand = () => false;
    dom.window.document.getElementById('copyGpt')!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dom.window.document.getElementById('copyStatus')!.textContent).toContain('Не удалось скопировать');
    dom.window.close();
  });
});
