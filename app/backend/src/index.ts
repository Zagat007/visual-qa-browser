import path from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import { z } from 'zod';
import { assertPublicHttpUrl } from '../../../audit-engine/security/url-policy.js';
import { redactText } from '../../../audit-engine/privacy/redaction.js';
import { JobManager } from './job-manager.js';
import { isAllowedApiOrigin, isAllowedControlPlaneHost, isCrossSiteFetch } from './control-plane-policy.js';
import { detectHardwareProfile } from '../../../audit-engine/orchestrator/execution-settings.js';
import { normalizeAuditConfiguration } from './audit-configuration.js';
import { providerCapabilities } from '../../../audit-engine/art-direction/provider.js';
import { computeInstanceId } from './instance-id.js';
import { applyFixPackage, buildChatGptFixPack, inspectWorkspace, listFixBackups, rollbackFix } from './fix-workflow.js';
import { approveVisualBaseline, baselineImage, compareVisualBaseline, listVisualBaselines } from './visual-regression.js';
import { runSafeScenario } from '../../../audit-engine/scenarios/run-scenario.js';

const rootDir = path.resolve(process.env.VQB_ROOT ?? process.cwd());
const app = express();
const jobs = new JobManager(rootDir);
await jobs.initialize();
const port = Number(process.env.PORT ?? 4210);
const instanceId = computeInstanceId(rootDir);

app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!isAllowedControlPlaneHost(req.headers.host, port)) {
    res.status(421).json({ error: 'Rejected control-plane Host header.' });
    return;
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});
app.use('/api', (req, res, next) => {
  if (!isAllowedApiOrigin(req.headers.origin, port) || isCrossSiteFetch(req.headers['sec-fetch-site'])) {
    res.status(403).json({ error: 'Cross-origin control-plane request rejected.' });
    return;
  }
  next();
});
app.use(express.json({ limit: '32kb' }));
app.use('/reports', express.static(path.join(rootDir, 'reports'), { dotfiles: 'deny', index: false, fallthrough: false }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'visual-qa-browser', safeMode: true, pid: process.pid, instanceId });
});

const auditRequestSchema = z.object({
  url: z.string().min(1).max(2048),
  configuration: z.object({
    mode: z.enum(['FULL', 'VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'RUNTIME', 'ACCESSIBILITY', 'SEO', 'SECURITY', 'PERFORMANCE', 'CUSTOM']),
    modules: z.array(z.enum(['VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'RUNTIME', 'ACCESSIBILITY', 'SEO', 'SECURITY', 'PERFORMANCE'])).min(1).max(9),
    viewportPreset: z.enum(['QUICK', 'STANDARD', 'DEEP', 'SELECTED', 'CUSTOM']),
    viewportNames: z.array(z.string().regex(/^[a-z0-9-]+$/)).max(32).optional(),
    customViewport: z.object({
      width: z.number().int().min(240).max(7680),
      height: z.number().int().min(240).max(7680),
    }).strict().optional(),
    powerMode: z.enum(['ECO', 'NORMAL', 'FAST', 'MAX']).default('NORMAL'),
    interactionDepth: z.enum(['KEY', 'ALL']).default('KEY'),
    artDirection: z.object({
      enabled: z.boolean(),
      provider: z.enum(['MANUAL', 'OPENAI']),
      mode: z.enum(['ECONOMY', 'STANDARD', 'DEEP']),
      layers: z.array(z.enum(['PREMIUM_QUALITY','IMAGE_QUALITY_VARIETY','SEMANTIC_IMAGE_FIT','VISUAL_HIERARCHY','TYPOGRAPHY_SPACING','EMOTIONAL_FIT','CONVERSION','CROSS_SECTION','CROSS_PAGE','MOBILE','DESKTOP'])).min(1).max(11),
      privateEvidenceAllowed: z.literal(false).default(false),
      siteProfile: z.enum(['AUTO','MELODY4YOU','GENERIC']).default('AUTO'),
    }).strict().optional(),
  }).strict().superRefine((configuration, ctx) => {
    if (new Set(configuration.modules).size !== configuration.modules.length) {
      ctx.addIssue({ code: 'custom', message: 'Duplicate audit modules are not allowed.' });
    }
    if (configuration.viewportPreset === 'SELECTED' && (!configuration.viewportNames || configuration.viewportNames.length === 0)) {
      ctx.addIssue({ code: 'custom', message: 'Selected viewport mode requires at least one viewport.' });
    }
    if (configuration.viewportPreset === 'CUSTOM' && !configuration.customViewport) {
      ctx.addIssue({ code: 'custom', message: 'Custom viewport mode requires width and height.' });
    }
    if (configuration.viewportPreset !== 'SELECTED' && configuration.viewportNames?.length) {
      ctx.addIssue({ code: 'custom', message: 'viewportNames are allowed only for SELECTED viewport mode.' });
    }
    if (configuration.viewportPreset !== 'CUSTOM' && configuration.customViewport) {
      ctx.addIssue({ code: 'custom', message: 'customViewport is allowed only for CUSTOM viewport mode.' });
    }
    if (configuration.artDirection?.enabled && !configuration.modules.includes('VISUAL')) {
      ctx.addIssue({ code: 'custom', message: 'AI Art Director requires the VISUAL module for screenshot and visual evidence.' });
    }
  }),
}).strict();

app.get('/api/capabilities', async (_req, res) => {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(rootDir, 'configs', 'viewport-matrix.json'), 'utf8')) as {
      viewports?: Record<string, { width: number; height: number; orientation?: string }>;
    };
    const viewports = Object.entries(raw.viewports ?? {}).map(([name, value]) => ({
      name,
      width: value.width,
      height: value.height,
      orientation: value.orientation ?? 'landscape',
    }));
    res.json({
      language: 'ru',
      safeMode: true,
      modules: ['VISUAL', 'RESPONSIVE', 'FORMS', 'INTERACTIONS', 'RUNTIME', 'ACCESSIBILITY', 'SEO', 'SECURITY', 'PERFORMANCE'],
      unsupported: ['SOURCE', 'CROSS_BROWSER', 'AUTH_PRIVATE', 'REAL_SAFARI'],
      visualRegression: true,
      safeUserJourneys: true,
      powerModes: ['ECO', 'NORMAL', 'FAST', 'MAX'],
      hardware: detectHardwareProfile(),
      artDirector: providerCapabilities(),
      fixBridge: { defaultProjectRoot: process.env.VQB_PROJECT_ROOT?.trim() || null, schemaVersion: 2 },
      viewports,
    });
  } catch (error) {
    res.status(500).json({ error: redactText(error instanceof Error ? error.message : 'Unable to load capabilities.') });
  }
});

app.post('/api/audits', async (req, res) => {
  const parsed = auditRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body.' });
    return;
  }
  try {
    await assertPublicHttpUrl(parsed.data.url);
    const job = await jobs.create(parsed.data.url, normalizeAuditConfiguration(parsed.data.configuration));
    res.status(202).json(job);
  } catch (error) {
    res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Target rejected.') });
  }
});

app.get('/api/audits', (_req, res) => {
  res.json(jobs.list());
});

app.get('/api/diagnostics/jobs', (_req, res) => {
  res.json({ instanceId, ...jobs.diagnostics() });
});


app.post('/api/audits/:id/cancel', async (req, res) => {
  const job = await jobs.cancel(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Audit job not found.' });
    return;
  }
  res.json(job);
});

app.get('/api/audits/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Audit job not found.' });
    return;
  }
  res.json(job);
});

const workspaceRequestSchema = z.object({ projectRoot: z.string().min(1).max(4096) }).strict();
const rollbackRequestSchema = z.object({ projectRoot: z.string().min(1).max(4096), backupId: z.string().min(1).max(120) }).strict();

function reportDirForJob(job: NonNullable<ReturnType<typeof jobs.get>>): string {
  if (!job.reportUrl?.startsWith('/reports/')) throw new Error('Audit report is not ready.');
  const relative = job.reportUrl.slice('/reports/'.length).replaceAll('\\', '/');
  const reportsRoot = path.resolve(rootDir, 'reports');
  const reportPath = path.resolve(reportsRoot, ...relative.split('/'));
  if (!reportPath.startsWith(`${reportsRoot}${path.sep}`) || path.basename(reportPath) !== 'report.html') throw new Error('Invalid audit report path.');
  return path.dirname(reportPath);
}

app.post('/api/workspace/inspect', async (req, res) => {
  const parsed = workspaceRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid workspace request.' }); return; }
  try { res.json(await inspectWorkspace(parsed.data.projectRoot)); }
  catch (error) { res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Workspace inspection failed.') }); }
});

app.post('/api/audits/:id/fix-pack', async (req, res) => {
  const parsed = workspaceRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid workspace request.' }); return; }
  const job = jobs.get(req.params.id);
  if (!job) { res.status(404).json({ error: 'Audit job not found.' }); return; }
  try {
    const result = await buildChatGptFixPack(rootDir, parsed.data.projectRoot, reportDirForJob(job), job);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-VQB-Workspace-Fingerprint', result.inspection.fingerprint);
    res.send(result.buffer);
  } catch (error) {
    res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Unable to create ChatGPT Fix Pack.') });
  }
});

app.post('/api/fixes/apply', express.raw({ type: ['application/zip', 'application/octet-stream'], limit: '64mb' }), async (req, res) => {
  const projectRoot = typeof req.query.projectRoot === 'string' ? req.query.projectRoot : '';
  if (!projectRoot || !Buffer.isBuffer(req.body)) { res.status(400).json({ error: 'Project root and ZIP body are required.' }); return; }
  try { res.json(await applyFixPackage(rootDir, projectRoot, req.body)); }
  catch (error) { res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Fix package apply failed.') }); }
});

app.post('/api/fixes/backups', async (req, res) => {
  const parsed = workspaceRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid workspace request.' }); return; }
  try { res.json(await listFixBackups(rootDir, parsed.data.projectRoot)); }
  catch (error) { res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Unable to list fix backups.') }); }
});

app.post('/api/fixes/rollback', async (req, res) => {
  const parsed = rollbackRequestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid rollback request.' }); return; }
  try { res.json(await rollbackFix(rootDir, parsed.data.projectRoot, parsed.data.backupId)); }
  catch (error) { res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Rollback failed.') }); }
});

const baselineRequest = z.object({ auditId: z.string().uuid(), baselineId: z.string().uuid().optional() }).strict();
app.post('/api/visual-baselines/approve', async (req, res) => {
  const parsed = baselineRequest.safeParse(req.body);
  if (!parsed.success || parsed.data.baselineId) { res.status(400).json({ error: 'Invalid baseline approval request.' }); return; }
  const job = jobs.get(parsed.data.auditId);
  if (!job) { res.status(404).json({ error: 'Audit not found.' }); return; }
  try { res.json(await approveVisualBaseline(rootDir, job, reportDirForJob(job))); }
  catch (error) { res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Baseline approval failed.') }); }
});
app.post('/api/visual-baselines/list', async (req, res) => {
  const parsed = z.object({ url: z.string().min(1).max(2048) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid baseline query.' }); return; }
  try { res.json(await listVisualBaselines(rootDir, parsed.data.url)); }
  catch (error) { res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Baseline listing failed.') }); }
});
app.post('/api/visual-baselines/compare', async (req, res) => {
  const parsed = baselineRequest.safeParse(req.body);
  if (!parsed.success || !parsed.data.baselineId) { res.status(400).json({ error: 'Invalid comparison request.' }); return; }
  const job = jobs.get(parsed.data.auditId);
  if (!job) { res.status(404).json({ error: 'Audit not found.' }); return; }
  try { res.json(await compareVisualBaseline(rootDir, job, reportDirForJob(job), parsed.data.baselineId)); }
  catch (error) { res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Visual comparison failed.') }); }
});
app.get('/api/visual-baselines/:id/images/:viewport', async (req, res) => {
  try { res.type('png').send(await baselineImage(rootDir, req.params.id, req.params.viewport)); }
  catch { res.status(404).json({ error: 'Baseline image unavailable.' }); }
});

const scenarioStep = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assertVisible'), selector: z.string().min(1).max(300) }).strict(),
  z.object({ action: z.literal('click'), selector: z.string().min(1).max(300) }).strict(),
  z.object({ action: z.literal('check'), selector: z.string().min(1).max(300) }).strict(),
  z.object({ action: z.literal('assertText'), selector: z.string().min(1).max(300), expected: z.string().min(1).max(120) }).strict(),
  z.object({ action: z.literal('fill'), selector: z.string().min(1).max(300), value: z.string().min(1).max(120) }).strict(),
]);
const scenarioRequest = z.object({
  name: z.string().min(1).max(80),
  url: z.string().url().max(2048),
  viewport: z.object({ width: z.number().int().min(240).max(1920), height: z.number().int().min(240).max(1200) }).strict(),
  steps: z.array(scenarioStep).min(1).max(12),
}).strict();
let scenarioRunInProgress = false;
app.post('/api/scenarios/run', async (req, res) => {
  const parsed = scenarioRequest.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid scenario. Use 1–12 supported steps.' }); return; }
  if (scenarioRunInProgress) { res.status(409).json({ error: 'Another scenario is running. Try again after it finishes.' }); return; }
  scenarioRunInProgress = true;
  try { res.json(await runSafeScenario(rootDir, parsed.data)); }
  catch (error) { res.status(400).json({ error: redactText(error instanceof Error ? error.message : 'Scenario failed.') }); }
  finally { scenarioRunInProgress = false; }
});


app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

const frontendDir = path.join(rootDir, 'dist', 'frontend');
app.use(express.static(frontendDir, { dotfiles: 'deny', index: false }));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Visual QA Browser listening on http://127.0.0.1:${port}\n`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
