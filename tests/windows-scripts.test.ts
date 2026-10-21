import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const install = fs.readFileSync('INSTALL.bat', 'utf8');
const start = fs.readFileSync('START.bat', 'utf8');
const stop = fs.readFileSync('STOP.bat', 'utf8');
const verify = fs.readFileSync('VERIFY.bat', 'utf8');
const diagnose = fs.readFileSync('DIAGNOSE.bat', 'utf8');
const run = fs.readFileSync('RUN.bat', 'utf8');
const verifier = fs.readFileSync('scripts/verify.mjs', 'utf8');

describe('Windows launcher safety contracts', () => {
  it('enforces the Node runtime floor and deterministic install path', () => {
    expect(install).toContain('Node.js 22.19+');
    expect(install).not.toContain('npm.cmd install --package-lock-only');
    expect(install).toContain('Refusing a non-reproducible install');
    expect(install).toContain('node scripts\\verify-package-integrity.mjs');
    expect(install.indexOf('node scripts\\verify-package-integrity.mjs')).toBeLessThan(install.indexOf('npm.cmd ci --ignore-scripts'));
    expect(install).toContain('Release integrity check failed before dependency installation');
    expect(install).toContain('npm.cmd ci --ignore-scripts');
    expect(install).toContain('node_modules\\.bin\\playwright.cmd install chromium');
    expect(install).toContain('call VERIFY.bat');
    expect(install).toContain('scripts\\check-runtime.mjs');
    expect(verifier).toContain("await run('selftest')");
    expect(verifier).toContain("await run('smoke:runtime')");
    expect(verifier.match(/await run\('integrity:package'\)/g)?.length).toBe(2);
    expect(verifier).not.toContain("await run('provenance:package')");
  });

  it('starts only the owned server and waits for health', () => {
    expect(start).toContain('vqb-server.pid');
    expect(start).toContain("-notmatch '^\\d+$'");
    expect(start).toContain('127.0.0.1:4210/api/health');
    expect(start).toContain("dist[\\\\/]server[\\\\/]index\\.js");
    expect(start).toContain('start.log');
    expect(start).toContain('server-error.log');
    expect(start).toContain('-RedirectStandardError');
    expect(start).toContain('Get-NetTCPConnection');
    expect(start).toContain('[int]$r.pid -eq $id');
    expect(start).toContain('instanceId');
    expect(start).toContain('--vqb-instance=');
    expect(start).toContain('exit 6');
    expect(start).toContain('Owned Visual QA Browser process is unhealthy');
    expect(start).toContain('call STOP.bat');
    expect(start).toContain('SHA256');
    expect(start).toContain('VQB_START_BOOTSTRAP');
    expect(start).toContain('call RUN.bat');
    expect(start).toContain('First launch detected');
    expect(start).not.toContain('Run VERIFY.bat or INSTALL.bat first');
    expect(start.indexOf('if not exist "dist\\server\\index.js" (')).toBeLessThan(start.indexOf('set "PID_FILE='));
    expect(start.indexOf('if defined VQB_START_BOOTSTRAP')).toBeLessThan(start.indexOf('call RUN.bat'));
    expect(start).toContain('pause');
  });

  it('never stops a process solely because it owns port 4210', () => {
    expect(stop).toContain('vqb-server.pid');
    expect(stop).toContain("-notmatch '^\\d+$'");
    expect(stop).toContain('Get-CimInstance Win32_Process');
    expect(stop).not.toMatch(/netstat|Get-NetTCPConnection|taskkill\s+\/IM\s+node/i);
    expect(stop).toContain('--vqb-instance=');
    expect(stop).toContain('SHA256');
    expect(stop).toContain('No process was terminated');
    expect(stop).toContain("-FilePath 'taskkill.exe'");
    expect(stop).toContain("@('/PID',[string]$id,'/T','/F')");
    expect(stop).toContain('Owned Visual QA Browser process tree could not be stopped');
  });
  it('provides local one-command scheduler diagnostics', () => {
    expect(diagnose).toContain('/api/health');
    expect(diagnose).toContain('/api/diagnostics/jobs');
    expect(diagnose).toContain('node.exe');
    expect(diagnose).toContain('Expected instanceId');
  });

  it('provides a one-command final verifier with a persistent log', () => {
    expect(verify).toContain('npm.cmd run verify');
    expect(verifier).toContain('final-verification.log');
    expect(verify).toContain('Run INSTALL.bat first');
  });

  it('retains verifier exit codes and blocks one-click startup after failure', () => {
    expect(verify).toContain('set "VERIFY_CODE=%ERRORLEVEL%"');
    expect(verify).toContain('exit /b %VERIFY_CODE%');
    expect(run).toContain('call INSTALL.bat');
    expect(run).toContain('call VERIFY.bat');
    expect(run).toContain('if errorlevel 1 goto failed');
    expect(run).toContain('call START.bat');
    expect(start).not.toContain('%PORT_PID%');
  });
});
