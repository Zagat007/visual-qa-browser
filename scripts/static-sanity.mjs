import fs from 'node:fs';
import path from 'node:path';

const issues = [];
const check = (condition, message) => { if (!condition) issues.push(message); };

const required = [
  'package.json',
  'tsconfig.json',
  'INSTALL.bat',
  'START.bat',
  'STOP.bat',
  'VERIFY.bat',
  'DIAGNOSE.bat',
  'RUN.bat',
  'scripts/check-runtime.mjs',
  'scripts/verify.mjs',
  'scripts/runtime-smoke.mjs',
  'scripts/create-package-provenance.mjs',
  'scripts/package-files.mjs',
  'scripts/verify-package-integrity.mjs',
  'scripts/publish-frontend-build.mjs',
  'scripts/build-frontend.mjs',
  'scripts/frontend-build-files.mjs',
  'configs/viewport-matrix.json',
  'app/backend/src/index.ts',
  'app/backend/src/lighthouse-worker-entry.ts',
  'app/backend/src/visual-regression.ts',
  'app/backend/src/job-manager.ts',
  'app/backend/src/instance-id.ts',
  'app/backend/src/control-plane-policy.ts',
  'app/frontend/index.html',
  'app/frontend/src/App.tsx',
  'app/frontend/src/main.tsx',
  'audit-engine/browser/viewport-config.ts',
  'audit-engine/scenarios/run-scenario.ts',
  'audit-engine/orchestrator/run-audit.ts',
  'audit-engine/orchestrator/verdict.ts',
  'audit-engine/orchestrator/execution-settings.ts',
  'audit-engine/orchestrator/classification.ts',
  'audit-engine/evidence/provenance.ts',
  'audit-engine/deterministic-capture/stabilize.ts',
  'audit-engine/deterministic-capture/capture.ts',
  'audit-engine/deterministic-capture/sections.ts',
  'audit-engine/geometry/geometry.ts',
  'audit-engine/visual/typography.ts',
  'audit-engine/visual/images.ts',
  'audit-engine/accessibility/accessibility.ts',
  'audit-engine/seo/seo.ts',
  'audit-engine/seo/site-checks.ts',
  'audit-engine/seo/soft404.ts',
  'audit-engine/security/delivery.ts',
  'audit-engine/interactions/policy.ts',
  'audit-engine/interactions/interaction.ts',
  'audit-engine/forms/forms.ts',
  'audit-engine/runtime/collector.ts',
  'audit-engine/security/url-policy.ts',
  'audit-engine/security/safe-mode.ts',
  'audit-engine/responsive/sweep.ts',
  'audit-engine/performance/statistics.ts',
  'audit-engine/performance/lighthouse.ts',
  'audit-engine/performance/lighthouse-core.ts',
  'audit-engine/performance/lighthouse-contract.ts',
  'audit-engine/performance/lifecycle.ts',
  'configs/responsive-sweep.json',
  'audit-engine/privacy/redaction.ts',
  'audit-engine/privacy/secret-store.ts',
  'audit-engine/reporting/report.ts',
  'audit-engine/reporting/handoff.ts',
  'audit-engine/reporting/zip.ts',
  'audit-engine/art-direction/context.ts',
  'audit-engine/art-direction/provider.ts',
  'audit-engine/art-direction/rubric.ts',
  'audit-engine/art-direction/run.ts',
  'configs/site-profiles/generic.json',
  'configs/site-profiles/melody4you.json',
  'tests/url-policy.test.ts',
  'tests/visual-scenario.test.ts',
  'tests/report.test.ts',
  'tests/art-direction.test.ts',
  'tests/art-provider.test.ts',
  'tests/viewport-config.test.ts',
  'tests/responsive-sweep.test.ts',
  'tests/browser-engine.test.ts',
  'tests/audit-runtime.test.ts',
  'tests/interaction-safety.test.ts',
  'tests/seo-technical.test.ts',
  'tests/performance-statistics.test.ts',
  'tests/performance-runtime.test.ts',
  'tests/performance-isolation.test.ts',
  'tests/fixtures/lighthouse-isolate-worker.mjs',
  'tests/performance-lifecycle.test.ts',
  'tests/performance-browser.test.ts',
  'tests/verdict.test.ts',
  'tests/safe-mode.test.ts',
  'tests/secret-store.test.ts',
  'tests/redaction.test.ts',
  'tests/runtime-collector.test.ts',
  'tests/windows-scripts.test.ts',
  'tests/provenance.test.ts',
  'tests/package-integrity.test.ts',
  'tests/job-manager.test.ts',
  'tests/forms-touch-target.test.ts',
  'tests/instance-id.test.ts',
  'tests/control-plane-policy.test.ts',
  'tests/execution-settings.test.ts',
  'tests/classification.test.ts',
  'tests/build-pipeline.test.ts',
  'docs/FUNCTIONS_RU.txt',
  'docs/R21_LIGHTHOUSE_ISOLATION.md',
  'docs/R22_STARTUP_SELF_HEAL.md',
  'docs/R23_WINDOWS_TYPECHECK_FIX.md',
  'docs/R24_LIGHTHOUSE_TEST_BOUNDARY.md',
  'AGENT_AUDIT_HANDOFF_R24.md',
  'AGENT_AUDIT_PROMPT_R24.txt',
  'AGENT_AUDIT_CHECKLIST_R24.md',
  'docs/AI_ART_DIRECTOR.md',
  'app/frontend/src/help.ts',
];

for (const file of required) check(fs.existsSync(path.resolve(file)), `Missing required file: ${file}`);

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
check(packageJson.version === '1.2.0', 'Package version must remain 1.2.0 for the first public open-source release.');
check(packageJson.dependencies?.['axe-core'] === '4.13.0', 'axe-core version must be pinned to 4.13.0.');
check(packageJson.dependencies?.lighthouse === '13.5.0', 'Lighthouse version must be pinned to 13.5.0.');
check(packageJson.dependencies?.['chrome-launcher'] === '1.2.1', 'chrome-launcher version must be pinned to 1.2.1.');
check(packageJson.engines?.node === '>=22.19.0', 'Node runtime floor must be >=22.19.0.');
check(packageJson.scripts?.['build:server']?.includes('--target node22'), 'Backend build target must match Node 22.');
check(packageJson.scripts?.['build:frontend'] === 'node scripts/build-frontend.mjs', 'build:frontend must use the sequential frontend writer.');
check(packageJson.scripts?.['build:publish-frontend'] === 'node scripts/publish-frontend-build.mjs', 'build:publish-frontend must publish the completed frontend build.');
check(packageJson.scripts?.['build:server']?.includes('tsup app/backend/src/index.ts') && packageJson.scripts?.['build:server']?.includes('app/backend/src/lighthouse-worker-entry.ts'), 'build:server must bundle both control-plane and Lighthouse worker entries.');
check(packageJson.scripts?.build === 'npm run build:frontend && npm run build:publish-frontend && npm run build:server', 'build must run frontend, publish and server steps in order.');
const lighthouseWorkerEntry = fs.readFileSync('app/backend/src/lighthouse-worker-entry.ts', 'utf8');
check(lighthouseWorkerEntry.includes('(error: Error | null) => process.exit(error ? 1 : code)'), 'Lighthouse worker IPC completion callback must remain explicitly typed under strict TypeScript.');
const appSource = fs.readFileSync('app/frontend/src/App.tsx', 'utf8');
check(appSource.includes('signal: signal ?? null'), 'Optional fetch AbortSignal must be normalized instead of explicitly passing undefined under exactOptionalPropertyTypes.');
const orchestratorSource = fs.readFileSync('audit-engine/orchestrator/run-audit.ts', 'utf8');
const performanceBrowserTest = fs.readFileSync('tests/performance-browser.test.ts', 'utf8');
check(orchestratorSource.includes('dependencies.performanceRunner ?? runPerformanceAudit') && orchestratorSource.includes('performance = await performanceRunner({'), 'Audit orchestrator must preserve the isolated production runner while allowing deterministic dependency injection in tests.');
check(performanceBrowserTest.includes('{ performanceRunner: runPerformanceAudit }') && performanceBrowserTest.includes('fixtureRequests).toBeGreaterThanOrEqual(3)'), 'Real Lighthouse integration test must observe deterministic fixture traffic in-process instead of weakening the request assertion.');
const viteConfigSource = fs.readFileSync('app/frontend/vite.config.ts', 'utf8');
check(viteConfigSource.includes(".vite-build"), 'Vite must build inside the frontend project tree before publishing.');
check(viteConfigSource.includes('write: false') && viteConfigSource.includes('emptyOutDir: false'), 'Vite must only generate output; the sequential writer owns output cleanup.');
const frontendBuilderSource = fs.readFileSync('scripts/build-frontend.mjs', 'utf8');
check(frontendBuilderSource.includes("from 'vite'") && frontendBuilderSource.includes('await build('), 'Frontend build must still compile the real Vite bundle.');
check(frontendBuilderSource.includes('writeFrontendOutput('), 'Frontend output must be published after bundle generation.');
check(fs.existsSync('scripts/publish-frontend-build.mjs'), 'Frontend publish script is required.');
const packageIntegritySource = fs.readFileSync('scripts/verify-package-integrity.mjs', 'utf8');
check(packageIntegritySource.includes('assertExactSet') && packageIntegritySource.includes('actualForManifest') && packageIntegritySource.includes('actualForProvenance'), 'Package integrity must reject unexpected or untracked release files.');

const requiredScripts = ['dev', 'build', 'build:frontend', 'build:publish-frontend', 'build:server', 'start', 'typecheck', 'test', 'selftest', 'verify', 'smoke:runtime', 'static:check', 'provenance:package', 'integrity:package'];
for (const script of requiredScripts) check(Boolean(packageJson.scripts?.[script]), `Missing package script: ${script}`);

const declaredPackages = new Set([...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.devDependencies ?? {})]);
const sourceRoots = ['app', 'audit-engine', 'tests'];
const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
};
for (const root of sourceRoots) walk(root);
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) continue;
    const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    check(Boolean(packageName && declaredPackages.has(packageName)), `Undeclared package import ${packageName ?? specifier} <- ${file}`);
  }
}

const lockPath = 'package-lock.json';
if (!fs.existsSync(lockPath)) {
  issues.push('package-lock.json is missing; dependency graph is not reproducibly locked.');
} else {
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    check(lock.lockfileVersion === 3, 'package-lock.json must use npm lockfileVersion 3.');
    check(lock.packages?.['']?.version === packageJson.version, 'package-lock root version does not match package.json.');
    for (const [name, version] of Object.entries({ ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) })) {
      const key = `node_modules/${name}`;
      check(Boolean(lock.packages?.[key]), `package-lock.json is missing ${name}.`);
      if (lock.packages?.[key]) check(lock.packages[key].version === version, `package-lock version mismatch for ${name}: expected ${version}, got ${lock.packages[key].version}.`);
    }
  } catch (error) {
    issues.push(`package-lock.json could not be validated: ${error instanceof Error ? error.message : 'unknown parse error'}`);
  }
}

const install = fs.readFileSync('INSTALL.bat', 'utf8');
const start = fs.readFileSync('START.bat', 'utf8');
const stop = fs.readFileSync('STOP.bat', 'utf8');
const verify = fs.readFileSync('VERIFY.bat', 'utf8');
const diagnose = fs.readFileSync('DIAGNOSE.bat', 'utf8');
const verifier = fs.readFileSync('scripts/verify.mjs', 'utf8');
for (const [name, content, needles] of [
  ['INSTALL.bat', install, ['npm.cmd ci --ignore-scripts', 'node_modules\\.bin\\playwright.cmd install chromium', 'call VERIFY.bat', 'scripts\\check-runtime.mjs', 'Node.js 22.19+']],
  ['START.bat', start, ['127.0.0.1:4210/api/health', 'vqb-server.pid', 'dist\\server\\index.js', "-notmatch '^\\d+$'", 'start.log', 'server-error.log', '-RedirectStandardError']],
  ['STOP.bat', stop, ['vqb-server.pid', 'Get-CimInstance Win32_Process', 'dist[\\\\/]server', "-notmatch '^\\d+$'"]],
  ['VERIFY.bat', verify, ['npm.cmd run verify', 'scripts\\check-runtime.mjs', 'exit /b %VERIFY_CODE%']],
  ['scripts/verify.mjs', verifier, ["await run('integrity:package')", "await run('selftest')", "await run('smoke:runtime')", "[PASS] Package integrity remained unchanged.", 'final-verification.log', 'process.exitCode = 1']],
  ['DIAGNOSE.bat', diagnose, ['/api/health', '/api/diagnostics/jobs', 'Expected instanceId', 'node.exe']],
]) {
  for (const needle of needles) check(content.includes(needle), `${name} missing required contract fragment: ${needle}`);
}
check(!/netstat|Get-NetTCPConnection|taskkill\s+\/IM\s+node/i.test(stop), 'STOP.bat must not kill processes by port or generic node.exe ownership.');
check(start.includes('instanceId') && start.includes('SHA256'), 'START.bat must bind health to this installation identity.');
check(start.includes('VQB_START_BOOTSTRAP') && start.includes('call RUN.bat') && start.includes('First launch detected') && !start.includes('Run VERIFY.bat or INSTALL.bat first'), 'START.bat must self-heal a clean first launch through the verified RUN pipeline instead of requiring manual bootstrap knowledge.');
const startBootstrapIndex = start.indexOf('if not exist "dist\\server\\index.js" (');
const startPidIndex = start.indexOf('set "PID_FILE=');
check(startBootstrapIndex >= 0 && startPidIndex >= 0 && startBootstrapIndex < startPidIndex, 'START first-run bootstrap must execute before PID/server startup logic.');
check(start.indexOf('if defined VQB_START_BOOTSTRAP', startBootstrapIndex) > startBootstrapIndex && start.indexOf('call RUN.bat', startBootstrapIndex) > startBootstrapIndex, 'START must guard recursive bootstrap before delegating to RUN.bat.');
check(stop.includes('--vqb-instance=') && stop.includes('SHA256') && stop.includes('No process was terminated'), 'STOP.bat must refuse to kill a process whose installation identity marker does not match.');
check(stop.includes("-FilePath 'taskkill.exe'") && stop.includes("@('/PID',[string]$id,'/T','/F')") && stop.includes('Owned Visual QA Browser process tree could not be stopped'), 'STOP.bat must terminate the verified owned backend process tree so isolated Lighthouse/Chrome descendants cannot survive emergency shutdown.');
check(start.includes('exit 6') && start.includes('Owned Visual QA Browser process is unhealthy') && start.includes('call STOP.bat'), 'START must safely recycle an unhealthy process only after instance ownership is proven.');

const jobManagerSource = fs.readFileSync('app/backend/src/job-manager.ts', 'utf8');
const controllerSetIndex = jobManagerSource.indexOf('this.controllers.set(id, controller)');
const runningPublishIndex = jobManagerSource.indexOf("job.status = 'RUNNING'");
check(controllerSetIndex >= 0 && runningPublishIndex >= 0 && controllerSetIndex < runningPublishIndex, 'Cancellation controller must be registered before RUNNING is published.');
check(jobManagerSource.includes('recovery-interrupted'), 'Interrupted RUNNING jobs must be quarantined instead of auto-resumed.');
check(jobManagerSource.includes('activeIds') && !jobManagerSource.includes('private running = 0'), 'Scheduler must derive activity from active job IDs, not a fragile running counter.');
check(jobManagerSource.includes('watchdog-timeout') && jobManagerSource.includes('STALL_TIMEOUT_REASON'), 'JobManager must abort audits that stop making progress.');
check(jobManagerSource.includes('writeAtomic(') && jobManagerSource.includes('fs.rename(tempPath, filePath)'), 'Job checkpoint state must be written atomically.');
check(jobManagerSource.includes("job.currentStage = 'cancelling'") && jobManagerSource.includes('controller.abort(new Error(USER_CANCEL_REASON))'), 'Running cancellation must publish intent before asynchronous runner cleanup.');
const orchestrator = fs.readFileSync('audit-engine/orchestrator/run-audit.ts', 'utf8');
check(orchestrator.includes('truncationIncompleteReasons(truncatedEvidenceSources)'), 'Truncated evidence must feed the incomplete-coverage verdict gate.');
check(orchestrator.includes('confirmedSiteTechnicalIssueCount') && orchestrator.includes('confirmedInteractionIssueCount'), 'Run audit must use centralized target-finding classification.');
check(orchestrator.includes('performance:incomplete-skipped') && orchestrator.includes('plannedPerformanceRuns - performance.runs.length'), 'Timed-out performance runs must be explicitly accounted for in weighted progress.');
const lighthouseSource = fs.readFileSync('audit-engine/performance/lighthouse.ts', 'utf8');
const lighthouseCore = fs.readFileSync('audit-engine/performance/lighthouse-core.ts', 'utf8');
const lighthouseWorker = fs.readFileSync('app/backend/src/lighthouse-worker-entry.ts', 'utf8');
check(lighthouseSource.includes("spawn(launch.command") && lighthouseSource.includes('lighthouse-worker-entry.js') && !lighthouseSource.includes("from 'lighthouse'"), 'Public Lighthouse execution must cross an isolated child-process boundary without loading Lighthouse in the control plane.');
check(lighthouseSource.includes("process.env.NODE_ENV === 'test' ? process.env.VQB_LIGHTHOUSE_WORKER_ENTRY : undefined"), 'Lighthouse worker override must be restricted to test mode.');
check(lighthouseSource.includes('ISOLATE_STALL_TIMEOUT_MS') && lighthouseSource.includes('terminateProcessTree') && lighthouseSource.includes("taskkill.exe") && lighthouseSource.includes("['/PID', String(pid), '/T', '/F']"), 'Parent Lighthouse watchdog must hard-kill only the owned PID process tree.');
check(lighthouseCore.includes("if (runEvidence.status === 'FAILED' && /timed out after/i.test") && lighthouseCore.includes('break;'), 'A hard Lighthouse run timeout must fail fast instead of repeating doomed runs.');
check(lighthouseWorker.includes("send({ type: 'ready' })") && lighthouseWorker.includes("type: 'heartbeat'") && lighthouseWorker.includes("from '../../../audit-engine/performance/lighthouse-core.js'"), 'Lighthouse worker must expose ready/heartbeat IPC and import only the in-process measurement core.');
check(packageJson.scripts?.['build:server']?.includes('lighthouse-worker-entry.ts'), 'Production build must emit the Lighthouse worker entry.');
const technicalVerdictIndex = orchestrator.indexOf('const verdict = determineAuditStatus');
const technicalResultStatusIndex = orchestrator.indexOf('status, safeMode: true');
const artAssignmentIndex = orchestrator.indexOf('result.artDirection = await runArtDirectionReview');
check(technicalVerdictIndex >= 0 && technicalResultStatusIndex > technicalVerdictIndex && artAssignmentIndex > technicalResultStatusIndex, 'Technical verdict must be finalized before AI Art Direction executes.');
const afterArtAssignment = artAssignmentIndex >= 0 ? orchestrator.slice(artAssignmentIndex) : '';
check(!/result\.status\s*=/.test(afterArtAssignment), 'AI Art Direction must never mutate the technical result status.');

const report = fs.readFileSync('audit-engine/reporting/report.ts', 'utf8');
check(report.includes('root-cause-hypotheses.json') && report.includes('Группа гипотез по похожим проявлениям (не доказанная первопричина):'), 'Report must export clearly labeled root-cause hypotheses rather than claiming proven root causes.');
check(report.includes("entry.resourceType === 'document' && status >= 500") && report.includes("? 'P0'"), 'Main-document HTTP 5xx must be classifiable as P0.');

const backend = fs.readFileSync('app/backend/src/index.ts', 'utf8');
check(backend.includes("app.listen(port, '127.0.0.1'"), 'Backend must bind only to 127.0.0.1.');
check(backend.includes('isAllowedControlPlaneHost'), 'Backend must enforce control-plane Host validation.');
check(backend.includes('isAllowedApiOrigin'), 'Backend must enforce API Origin validation.');
check(backend.includes('CROSS_BROWSER') && backend.includes('AUTH_PRIVATE'), 'Backend capabilities must disclose unsupported cross-browser and authenticated/private workflows.');
check(backend.includes("app.get('/api/diagnostics/jobs'"), 'Backend must expose local scheduler diagnostics.');
check(backend.includes('computeInstanceId') && backend.includes('instanceId'), 'Health must expose installation identity for PID-safe Windows launch/stop.');
check(backend.includes("app.post('/api/workspace/inspect'") && backend.includes("app.post('/api/audits/:id/fix-pack'"), 'Backend must expose explicit source-aware ChatGPT Fix Pack endpoints.');
check(backend.includes("app.post('/api/fixes/apply'") && backend.includes("app.post('/api/fixes/rollback'"), 'Backend must expose local fix apply and rollback endpoints.');
const fixWorkflow = fs.readFileSync('app/backend/src/fix-workflow.ts', 'utf8');
check(fixWorkflow.includes('STALE_SOURCE') && fixWorkflow.includes('STALE_WORKSPACE') && fixWorkflow.includes('sourcePackFingerprint') && fixWorkflow.includes('beforeSha256'), 'Fix Bridge must bind fixes to the exported workspace and reject stale source before writes.');
check(fixWorkflow.includes('fix-backups') && fixWorkflow.includes('rollbackFix'), 'Fix Bridge must back up and support rollback.');
check(fixWorkflow.includes('ZIP64 archives are not supported') && fixWorkflow.includes('Multi-disk ZIP archives are not supported') && fixWorkflow.includes('central/local entry name mismatch'), 'Fix Bridge ZIP parser must reject ZIP64, multi-disk and central/local name ambiguity.');
check(fixWorkflow.includes("allowedActions: ['replace', 'create']") && fixWorkflow.includes("forbiddenActions: ['delete', 'rename', 'shell-command']"), 'Fix package contract must remain replace/create only.');
check(fixWorkflow.includes("base === '.env'") && fixWorkflow.includes('containsHighConfidenceSecret'), 'Source export must exclude env/key material and high-confidence secrets.');
check(fixWorkflow.includes("gpt-evidence.zip") && fixWorkflow.includes("Fix Pack не создан"), 'Fix Pack must require audit evidence before source export.');
check(!fixWorkflow.includes('spawn(') && fixWorkflow.includes('nonExecutingPrecheck'), 'Fix apply must not execute project scripts without an OS sandbox.');

const safeMode = fs.readFileSync('audit-engine/security/safe-mode.ts', 'utf8');
check(safeMode.includes('context.route('), 'Safe Mode must intercept requests at BrowserContext scope.');
check(safeMode.includes('context.routeWebSocket('), 'Safe Mode must intercept WebSockets at BrowserContext scope.');
check(safeMode.includes('isPotentiallyDestructiveGetUrl'), 'Safe Mode must not treat every GET as automatically safe.');


const frontendApp = fs.readFileSync('app/frontend/src/App.tsx', 'utf8');
check(frontendApp.includes('progressPercent'), 'Frontend must expose real audit progress percent.');
check(frontendApp.includes('role="progressbar"'), 'Frontend must render an accessible progressbar.');
check(frontendApp.includes('POWER_MODES'), 'Frontend must expose performance/power modes.');
check(frontendApp.includes('InfoTip'), 'Frontend must expose contextual i-tooltips.');
check(frontendApp.includes('AI Art Director') && frontendApp.includes('ART_DIRECTION_LAYERS'), 'Frontend must expose the AI Art Director advisory module and layer controls.');
check(frontendApp.includes('External AI analysis') && frontendApp.includes('privateEvidenceAllowed: false'), 'Frontend must disclose external AI and keep private evidence disabled in v1.1.');
check(frontendApp.includes('Технические → ChatGPT') && frontendApp.includes('Technical + Art → ChatGPT'), 'Frontend must expose separate technical and premium GPT prompt copying.');
check(frontendApp.includes('Остановить аудит'), 'Frontend must expose audit cancellation.');
check(frontendApp.includes('AbortSignal.timeout(4_000)') && frontendApp.includes('Остановка подтверждена') && frontendApp.includes('Backend не ответил на остановку'), 'Frontend cancellation must be bounded, retried once and report control-plane failure honestly.');
check(frontendApp.includes('Максимальный live-аудит'), 'Frontend must expose the honest maximum live-audit workflow.');
check(frontendApp.includes('CHATGPT FIX BRIDGE') && frontendApp.includes('Собрать Fix Pack для ChatGPT'), 'Frontend must expose the source-aware ChatGPT Fix Bridge.');
check(frontendApp.includes('Применить исправления') && frontendApp.includes('Rollback'), 'Frontend must expose explicit local apply and rollback actions.');
check(frontendApp.includes('Live re-check после загрузки'), 'Frontend must label live re-check as post-deploy rather than local proof.');
check(frontendApp.includes('HELP.baseline') && frontendApp.includes('HELP.scenario'), 'New visual-regression and scenario modules must expose Russian tooltips.');
check(frontendApp.includes("!['PASS', 'ISSUE'].includes(job.status)"), 'PARTIAL audits must not be approvable as visual baselines from UI.');
check(!frontendApp.includes('Release Audit'), 'UI must not label Chromium-only live scope as a full Release Audit.');
const jobManager = fs.readFileSync('app/backend/src/job-manager.ts', 'utf8');
check(jobManager.includes('job.progressPercent = progress.progressPercent'), 'JobManager must persist weighted progress updates.');
check(jobManager.includes('job.progressPercent = 100'), 'JobManager must set 100% only after audit completion.');
check(jobManager.includes('AbortController'), 'JobManager must support cancellation via AbortController.');
check(jobManager.includes('gptPromptUrl'), 'JobManager must publish direct GPT prompt URL.');
check(jobManager.includes('artImageBoardUrl') && jobManager.includes('artEvidenceUrl'), 'JobManager must publish direct Art Direction evidence and image-board URLs.');
check(jobManager.includes('recovery-interrupted') && jobManager.includes('scheduler-execution-failed'), 'JobManager must persist crash recovery and scheduler failure terminal states.');
const auditJobHook = fs.readFileSync('app/frontend/src/useAuditJob.ts', 'utf8');
check(auditJobHook.includes('response.status === 404') && auditJobHook.includes('setJob(null)'), 'Frontend must clear stale jobs after a 404 instead of polling forever.');
const reportWriter = fs.readFileSync('audit-engine/reporting/report.ts', 'utf8');
check(reportWriter.includes('<html lang="ru">'), 'HTML report must be primarily Russian (lang=ru).');
check(reportWriter.includes('gpt-fix-prompt.txt'), 'Report must export a GPT remediation prompt.');
check(reportWriter.includes('defects.json'), 'Report must export a normalized defect registry.');
check(reportWriter.includes('root-cause-hypotheses.json'), 'Report must export root-cause hypothesis groups.');
const handoff = fs.readFileSync('audit-engine/reporting/handoff.ts', 'utf8');
check(handoff.includes("issueIds: string[]") && !handoff.includes("bugIds: string[] }> = []"), 'Screenshot manifest associations must use issueIds, not the misleading bugIds field.');
check(handoff.includes('machine/security-delivery.json') && handoff.includes('machine/accessibility.json') && handoff.includes('machine/runtime.json') && handoff.includes('machine/performance-summary.json'), 'GPT evidence must carry machine-readable security, accessibility, runtime and performance evidence.');
check(handoff.includes('MAX_FULL_PAGE_HEIGHT') && handoff.includes('section screenshots retained'), 'Very tall full-page evidence must fall back to section screenshots.');

check(handoff.includes('schemaVersion: 3') && handoff.includes('viewportContextScreenshotMatches') && handoff.includes('visualIssuesWithoutExactScreenshot'), 'Evidence manifest must distinguish exact issue proof from viewport context.');
check(handoff.includes("sanitizeExternalArtifact('gpt-fix-prompt.txt'") && handoff.includes("sanitizeExternalArtifact('defects.json'"), 'External GPT handoff text/registries must pass through the external sanitizer.');
const safeModeSource = fs.readFileSync('audit-engine/security/safe-mode.ts', 'utf8');
check(safeModeSource.includes("ALLOWED_READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])") && safeModeSource.includes("!ALLOWED_READ_ONLY_METHODS.has(method)"), 'Safe Mode must use a read-only HTTP method allowlist.');
const urlPolicySource = fs.readFileSync('audit-engine/security/url-policy.ts', 'utf8');
check(urlPolicySource.includes('BLOCKED_IPV4_CIDRS') && urlPolicySource.includes('BLOCKED_IPV6_CIDRS') && urlPolicySource.includes('matchesDestructiveActionToken'), 'URL policy must cover special-use networks and destructive action variants.');
const classificationSource = fs.readFileSync('audit-engine/orchestrator/classification.ts', 'utf8');
check(classificationSource.includes("finding.rule !== 'small-control-target'") && classificationSource.includes("finding.rule === 'horizontal-overflow' || finding.rule === 'zero-size-interactive'"), 'Candidate form/geometry heuristics must not elevate target verdicts.');
const visualRegressionSource = fs.readFileSync('app/backend/src/visual-regression.ts', 'utf8');
check((visualRegressionSource.match(/const page = await browser\.newPage\(\);/g) ?? []).length === 1, 'Visual comparison must create exactly one comparison page instance.');

const formCollector = fs.readFileSync('audit-engine/forms/forms.ts', 'utf8');
check(formCollector.includes('ASSOCIATED_LABEL') && formCollector.includes('effectiveTouchTargetWidth') && formCollector.includes('element.labels'), 'Checkbox/radio target-size evidence must use the effective associated-label activation surface.');
check(reportWriter.includes("finding.rule === 'small-control-target'") && reportWriter.includes("state: targetSizeCandidate ? 'ТРЕБУЕТ ПРОВЕРКИ'"), 'Small target-size heuristics must remain candidates rather than auto-fix BUGs.');
check(reportWriter.includes('<option>P0</option>'), 'Report severity filter must support P0.');
check(reportWriter.includes('Копировать технические дефекты') && reportWriter.includes('premiumControlsHtml') && reportWriter.includes('copyPremiumGpt') && reportWriter.includes('Technical + Art → ChatGPT'), 'Report must provide a technical copy action and conditionally render the premium copy action only when Art Direction exists.');
check(reportWriter.includes('Производительность'), 'Report must include Russian performance reporting.');
check(reportWriter.includes('gpt-premium-fix-prompt.txt') && reportWriter.includes('art-direction.json'), 'Report must export Art Direction advisory outputs separately from technical defects.');
check(reportWriter.includes('IMAGE REVIEW BOARD') || fs.readFileSync('audit-engine/art-direction/run.ts', 'utf8').includes('IMAGE REVIEW BOARD'), 'Art Direction must provide an image review board.');
const artProvider = fs.readFileSync('audit-engine/art-direction/provider.ts', 'utf8');
check(artProvider.includes('ArtDirectorProvider') && artProvider.includes('OpenAIArtDirectorProvider') && artProvider.includes('ManualArtDirectorProvider'), 'Art Director must use provider abstraction with manual fallback.');
check(artProvider.includes('store: false') && artProvider.includes("'https://api.openai.com/v1/responses'"), 'External AI provider must use the Responses API without response storage.');
check(artProvider.includes("type: 'json_schema'") && artProvider.includes('strict: true'), 'External AI provider must use strict structured output.');
const artRun = fs.readFileSync('audit-engine/art-direction/run.ts', 'utf8');
check(artRun.includes("status:'NOT_CONFIGURED'") && artRun.includes('Provider failure is isolated'), 'Art Director provider absence/failure must be isolated from technical QA.');
check(backend.includes('z.literal(false).default(false)') && backend.includes('providerCapabilities()'), 'Backend must keep private AI evidence disabled and expose provider capabilities.');
check(artRun.includes('Cross-page review NOT VERIFIED') && artRun.includes('Cross-section review PARTIAL'), 'Art Direction must downgrade unsupported cross-page/cross-section scope instead of fabricating coverage.');
check(artRun.includes('computeWeightedArtScore') && artRun.includes('containsLikelyPii'), 'Art Direction must compute score locally and enforce the external-AI privacy firewall.');
const artRubric = fs.readFileSync('audit-engine/art-direction/rubric.ts', 'utf8');
check(artRubric.includes('visualHierarchy: 15') && artRubric.includes('conversionPresentation: 5'), 'Art Direction must own the transparent 100-point rubric in application code.');
check(artRubric.includes('isGenericRecommendation') && artRubric.includes('categoryEnabled'), 'Art Direction must filter generic advice and disabled analysis layers.');
check(artProvider.includes('totalImageByteLimit') && artProvider.includes('max_output_tokens'), 'External AI requests must have aggregate image-byte and output-token bounds.');
check(artProvider.includes('UNTRUSTED WEBSITE EVIDENCE') && artProvider.includes('instructions: buildArtDirectorSystemInstructions'), 'External AI provider must separate trusted instructions from untrusted website evidence.');
check(artProvider.includes('OPENAI_ART_DIRECTOR_MODEL') && !artProvider.includes("'gpt-6.1-sol'"), 'Art Director model must be explicitly configured instead of hard-coded.');
check(artProvider.includes('AbortSignal.any') && artProvider.includes('signal?.throwIfAborted()'), 'External AI request must honor the parent audit cancellation signal.');
const functionsRu = fs.readFileSync('docs/FUNCTIONS_RU.txt', 'utf8');
const auditRu = fs.readFileSync('AUDIT_RU.txt', 'utf8');
check(functionsRu.includes('AI ART DIRECTOR / PREMIUM VISUAL REVIEW') && functionsRu.includes('HUMAN OVERRIDE'), 'Russian function guide must document AI Art Director, privacy and recommendation lifecycle.');
check(functionsRu.includes('v1.2.0 live-scope') && functionsRu.includes('дочернем процессе') && !functionsRu.includes('Visual regression требует locked baseline/diff pipeline'), 'Russian function guide must describe the current v1.1.9 scope and Lighthouse isolation.');
check(auditRu.includes('Текущий релиз: Visual QA Browser v1.2.0.') && auditRu.includes('AGENT_AUDIT_HANDOFF_R24.md') && auditRu.includes('docs/R24_LIGHTHOUSE_TEST_BOUNDARY.md'), 'AUDIT_RU must point to the current r24 acceptance package, not historical handoffs.');
const artArchitectureDoc = fs.readFileSync('docs/AI_ART_DIRECTOR.md', 'utf8');
check(artArchitectureDoc.includes('TECHNICAL QA =') && artArchitectureDoc.includes('UNTRUSTED DATA') && artArchitectureDoc.includes('PARTIAL / NOT VERIFIED'), 'AI Art Director documentation must state truth-domain, prompt-injection and coverage guardrails.');

const stabilization = fs.readFileSync('audit-engine/deterministic-capture/stabilize.ts', 'utf8');
check(stabilization.includes('maxSteps = 120') && stabilization.includes('afterHeight') && stabilization.includes('stableBottomSamples'), 'Lazy-load warmup must be bounded and follow dynamic document growth to a stable bottom.');
check(stabilization.includes('ready: pending === 0'), 'Image readiness must not confuse terminal broken images with incomplete evidence.');

const executionSettings = fs.readFileSync('audit-engine/orchestrator/execution-settings.ts', 'utf8');
check(executionSettings.includes('safeWorkerCapacity'), 'Execution settings must cap concurrency by hardware.');
check(executionSettings.includes('FAST'), 'Execution settings must implement FAST mode.');

const viewportConfig = JSON.parse(fs.readFileSync('configs/viewport-matrix.json', 'utf8'));
check(viewportConfig.version === 1, 'Viewport config version must be 1.');
const presetCounts = { QUICK: 2, STANDARD: 6, FULL_VIEWPORTS: 16 };
for (const [preset, expected] of Object.entries(presetCounts)) {
  const names = viewportConfig.presets?.[preset];
  check(Array.isArray(names) && names.length === expected, `${preset} must contain ${expected} viewports.`);
  if (!Array.isArray(names)) continue;
  check(new Set(names).size === names.length, `${preset} contains duplicate viewport names.`);
  for (const name of names) {
    const spec = viewportConfig.viewports?.[name];
    check(Boolean(spec), `${preset} references missing viewport ${name}.`);
    if (!spec) continue;
    check(Number.isInteger(spec.width) && Number.isInteger(spec.height), `${name} has invalid dimensions.`);
    check(typeof spec.isMobile === 'boolean' && typeof spec.hasTouch === 'boolean', `${name} lacks explicit device context.`);
    check(Number.isFinite(spec.deviceScaleFactor) && spec.deviceScaleFactor > 0, `${name} lacks valid DPR.`);
    check(['portrait', 'landscape'].includes(spec.orientation), `${name} lacks valid orientation.`);
  }
}
check(viewportConfig.presets.FULL_VIEWPORTS.some((name) => viewportConfig.viewports[name]?.isMobile && viewportConfig.viewports[name]?.orientation === 'landscape'), 'DEEP viewport matrix must include at least one mobile landscape context.');
const boundaries = viewportConfig.breakpointBoundaries ?? [];
check(Array.isArray(boundaries) && boundaries.every((value) => Number.isInteger(value)), 'Breakpoint boundaries must be integer widths.');
const deepCount = presetCounts.FULL_VIEWPORTS + (Array.isArray(boundaries) ? boundaries.length * 3 : 0);

if (issues.length > 0) {
  console.error('STATIC_SANITY FAIL');
  console.error(`Checks failed: ${issues.length}`);
  for (const issue of issues) console.error(`- ${issue}`);
  console.log(`Required source files present: ${required.filter((file) => fs.existsSync(path.resolve(file))).length}/${required.length}`);
  console.log(`Source imports checked: ${sourceFiles.length} TS/TSX files.`);
  console.log(`Viewport plans inspected: QUICK=${presetCounts.QUICK}, STANDARD=${presetCounts.STANDARD}, DEEP=${deepCount}.`);
  process.exit(1);
}

console.log('STATIC_SANITY PASS');
console.log(`Required source files: ${required.length}/${required.length}`);
console.log(`Source imports checked: ${sourceFiles.length} TS/TSX files; all bare imports declared.`);
console.log(`Viewport plans: QUICK=${presetCounts.QUICK}, STANDARD=${presetCounts.STANDARD}, DEEP=${deepCount} (${presetCounts.FULL_VIEWPORTS}+${boundaries.length * 3} triad captures)`);
