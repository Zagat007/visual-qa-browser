import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listPackageFiles } from './package-files.mjs';

const root = path.resolve(process.cwd());
const manifestPath = path.join(root, 'PACKAGE_MANIFEST.sha256');
const provenancePath = path.join(root, 'PACKAGE_PROVENANCE.json');
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

function assertExactSet(label, actual, expected) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  if (actualSet.size !== actual.length) throw new Error(`${label} contains duplicate paths.`);
  if (expectedSet.size !== expected.length) throw new Error(`${label} expected set contains duplicate paths.`);
  const missing = expected.filter((entry) => !actualSet.has(entry));
  const extra = actual.filter((entry) => !expectedSet.has(entry));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`missing: ${missing.slice(0, 12).join(', ')}`);
    if (extra.length) parts.push(`unexpected: ${extra.slice(0, 12).join(', ')}`);
    throw new Error(`${label} file set mismatch (${parts.join(' | ')}).`);
  }
}

if (!fs.existsSync(manifestPath)) throw new Error('PACKAGE_MANIFEST.sha256 is missing.');
const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
if (!lines.length) throw new Error('PACKAGE_MANIFEST.sha256 is empty.');
const manifestEntries = [];
for (const line of lines) {
  const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line);
  if (!match) throw new Error(`Invalid manifest line: ${line.slice(0, 120)}`);
  const [, expected, relative] = match;
  if (relative.includes('\\')) throw new Error(`Manifest path must use POSIX separators: ${relative}`);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`Manifest path escapes package: ${relative}`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Manifest file is missing: ${relative}`);
  const actual = sha256(fs.readFileSync(resolved));
  if (actual !== expected) throw new Error(`Manifest hash mismatch: ${relative}`);
  manifestEntries.push(relative);
}

if (!fs.existsSync(provenancePath)) throw new Error('PACKAGE_PROVENANCE.json is missing.');
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
if (provenance.schemaVersion !== 1 || typeof provenance.sourceTreeHash !== 'string' || !/^[a-f0-9]{64}$/.test(provenance.sourceTreeHash) || !Array.isArray(provenance.files)) {
  throw new Error('PACKAGE_PROVENANCE.json is invalid.');
}
const provenancePaths = [];
const aggregate = crypto.createHash('sha256');
for (const entry of provenance.files) {
  if (!entry || typeof entry.path !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || !Number.isInteger(entry.bytes) || entry.bytes < 0) {
    throw new Error('Invalid provenance entry.');
  }
  if (entry.path.includes('\\')) throw new Error(`Provenance path must use POSIX separators: ${entry.path}`);
  const resolved = path.resolve(root, entry.path);
  if (!resolved.startsWith(`${root}${path.sep}`) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Provenance file is missing: ${entry.path}`);
  }
  const buffer = fs.readFileSync(resolved);
  if (buffer.byteLength !== entry.bytes) throw new Error(`Provenance byte-size mismatch: ${entry.path}`);
  if (sha256(buffer) !== entry.sha256) throw new Error(`Provenance hash mismatch: ${entry.path}`);
  aggregate.update(entry.path);
  aggregate.update('\0');
  aggregate.update(buffer);
  aggregate.update('\0');
  provenancePaths.push(entry.path);
}
if (provenance.sourceFileCount !== provenance.files.length) throw new Error('Provenance sourceFileCount does not match files[].');
if (aggregate.digest('hex') !== provenance.sourceTreeHash) throw new Error('Provenance sourceTreeHash does not match the verified source file set.');

const actualForManifest = listPackageFiles(root, { includeProvenance: true, includeManifest: false });
const actualForProvenance = listPackageFiles(root, { includeProvenance: false, includeManifest: false });
assertExactSet('Manifest', manifestEntries, actualForManifest);
assertExactSet('Provenance', provenancePaths, actualForProvenance);

console.log('PACKAGE_INTEGRITY PASS');
console.log(`Manifest files: ${manifestEntries.length}`);
console.log(`Provenance files: ${provenance.files.length}`);
console.log(`Source tree SHA-256: ${provenance.sourceTreeHash}`);
