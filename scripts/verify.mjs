import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import './check-runtime.mjs';

const root = process.cwd();
const log = fs.createWriteStream(path.join(root, 'final-verification.log'), { flags: 'w' });
const npmCli = process.env.npm_execpath;
let child;
const write = (message) => { process.stdout.write(message); log.write(message); };
const run = (script) => new Promise((resolve, reject) => {
  write(`\n[RUN] npm run ${script}\n`);
  child = spawn(process.execPath, [npmCli, 'run', script], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stdout.on('data', (data) => write(data));
  child.stderr.on('data', (data) => write(data));
  child.once('error', reject);
  child.once('exit', (code, signal) => {
    child = undefined;
    if (code === 0) resolve(); else reject(new Error(`${script} failed (code=${code}, signal=${signal ?? 'none'}).`));
  });
});

const manifestPath = path.join(root, 'PACKAGE_MANIFEST.sha256');
const provenancePath = path.join(root, 'PACKAGE_PROVENANCE.json');
const hasReleaseIntegrityArtifacts = fs.existsSync(manifestPath) || fs.existsSync(provenancePath);

write(`Visual QA Browser final verification\nStarted: ${new Date().toISOString()}\nNode: ${process.versions.node}; OS: ${process.platform}\n`);
try {
  if (!npmCli || !fs.existsSync(npmCli)) throw new Error('Run this verifier through npm run verify or VERIFY.bat.');
  if (hasReleaseIntegrityArtifacts) await run('integrity:package');
  else write('\n[NOT_RUN] Package integrity was not run: no release manifest/provenance is present in this source checkout. Release packages still enforce it.\n');
  await run('selftest');
  await run('smoke:runtime');
  if (hasReleaseIntegrityArtifacts) await run('integrity:package');
  else write('\n[NOT_RUN] Package integrity re-check was not run (source checkout without release artifacts).\n');
  if (hasReleaseIntegrityArtifacts) write('\n[PASS] Package integrity remained unchanged.\n');
  write('[PASS] All selftests passed.\n[PASS] Production server and Chromium UI smoke passed.\n');
} catch (error) {
  write(`\n[FAIL] ${error instanceof Error ? error.message : String(error)}\nSee final-verification.log.\n`);
  process.exitCode = 1;
} finally {
  await new Promise((resolve, reject) => { log.once('error', reject); log.end(resolve); });
}
