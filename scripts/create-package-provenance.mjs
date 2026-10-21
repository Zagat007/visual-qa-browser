import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { listPackageFiles } from './package-files.mjs';

const root = path.resolve(process.cwd());
const output = path.resolve(process.argv[2] ?? path.join(root, 'PACKAGE_PROVENANCE.json'));
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const files = listPackageFiles(root);
const fileEntries = files.map((relative) => {
  const buffer = fs.readFileSync(path.join(root, relative));
  return { path: relative, bytes: buffer.byteLength, sha256: sha256(buffer) };
});
const aggregate = crypto.createHash('sha256');
for (const file of fileEntries) {
  aggregate.update(file.path);
  aggregate.update('\0');
  aggregate.update(fs.readFileSync(path.join(root, file.path)));
  aggregate.update('\0');
}
const gitStatus = git(['status', '--porcelain']);
const packageLockPath = path.join(root, 'package-lock.json');
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  classification: gitStatus !== null && gitStatus.length > 0
    ? 'DEVELOPMENT_CHECKPOINT'
    : fs.existsSync(packageLockPath)
      ? 'SOURCE_SNAPSHOT'
      : 'BOOTSTRAP_SOURCE_PACKAGE',
  sourceTreeHash: aggregate.digest('hex'),
  sourceFileCount: fileEntries.length,
  gitCommit: git(['rev-parse', 'HEAD']),
  gitDirty: gitStatus === null ? null : gitStatus.length > 0,
  packageLockHash: fs.existsSync(packageLockPath) ? sha256(fs.readFileSync(packageLockPath)) : null,
  nodeVersion: process.versions.node,
  runtimeFloor: '>=22.19.0',
  runtimeFloorMet: (() => { const [major, minor] = process.versions.node.split('.').map(Number); return major > 22 || (major === 22 && minor >= 19); })(),
  files: fileEntries,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`PACKAGE_PROVENANCE ${manifest.classification}`);
console.log(`Source files: ${manifest.sourceFileCount}`);
console.log(`Source tree SHA-256: ${manifest.sourceTreeHash}`);
console.log(`Git: ${manifest.gitCommit ?? 'NOT_AVAILABLE'} dirty=${String(manifest.gitDirty)}`);
console.log(`Lockfile: ${manifest.packageLockHash ?? 'MISSING'}`);
