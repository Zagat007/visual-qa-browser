import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { AuditMetadata } from '../shared/types.js';

const execFileAsync = promisify(execFile);
const EXCLUDED_TOP_LEVEL = new Set(['.git', 'node_modules', 'dist', 'reports', 'audits', 'checkpoints', 'baselines']);
const EXCLUDED_TOP_LEVEL_FILES = new Set(['PACKAGE_PROVENANCE.json', 'PACKAGE_MANIFEST.sha256']);

async function listSourceFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (absoluteDir: string, relativeDir: string): Promise<void> => {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (!relativeDir && (EXCLUDED_TOP_LEVEL.has(entry.name) || EXCLUDED_TOP_LEVEL_FILES.has(entry.name))) continue;
      if (entry.name.endsWith('.log') || entry.name === '.vite-build' || entry.name.startsWith('.vite-build-stage-')) continue;
      if (entry.isDirectory()) await walk(path.join(absoluteDir, entry.name), relative);
      else if (entry.isFile()) files.push(relative);
    }
  };
  await walk(rootDir, '');
  return files;
}

async function hashFiles(rootDir: string, files: string[]): Promise<string> {
  const hash = crypto.createHash('sha256');
  for (const relative of files) {
    hash.update(relative.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(await fs.readFile(path.join(rootDir, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function optionalFileHash(filePath: string): Promise<string | null> {
  try {
    return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function gitState(rootDir: string): Promise<{ commit: string | null; dirty: boolean | null }> {
  try {
    const [{ stdout: commit }, { stdout: status }] = await Promise.all([
      execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: rootDir }),
      execFileAsync('git', ['status', '--porcelain'], { cwd: rootDir }),
    ]);
    return { commit: commit.trim() || null, dirty: status.trim().length > 0 };
  } catch {
    return { commit: null, dirty: null };
  }
}

export async function collectAuditMetadata(rootDir: string, browserVersion: string): Promise<AuditMetadata> {
  const sourceFiles = await listSourceFiles(rootDir);
  const configFiles = sourceFiles.filter((file) => file.startsWith('configs/'));
  const [sourceTreeHash, configHash, packageLockHash, git] = await Promise.all([
    hashFiles(rootDir, sourceFiles),
    hashFiles(rootDir, configFiles),
    optionalFileHash(path.join(rootDir, 'package-lock.json')),
    gitState(rootDir),
  ]);
  let appVersion = 'NOT_VERIFIED';
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8')) as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version.trim()) appVersion = pkg.version.trim();
  } catch { /* provenance remains explicit rather than guessing */ }
  return {
    appVersion,
    sourceTreeHash,
    sourceFileCount: sourceFiles.length,
    configHash,
    packageLockHash,
    gitCommit: git.commit,
    gitDirty: git.dirty,
    browserVersion,
    nodeVersion: process.versions.node,
    os: { platform: process.platform, release: os.release(), arch: process.arch },
  };
}
