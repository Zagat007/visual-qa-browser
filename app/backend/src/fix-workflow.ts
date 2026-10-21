import crypto from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { storedZip, type ZipEntry } from '../../../audit-engine/reporting/zip.js';
import type { AuditJob } from '../../../audit-engine/shared/types.js';
import { redactTextForExternalEvidence, redactUrlForExternalEvidence, sanitizeExternalArtifact, sanitizeExternalJson } from '../../../audit-engine/privacy/redaction.js';
import { signWorkspaceSnapshot } from '../../../audit-engine/privacy/secret-store.js';

const MAX_SOURCE_FILES = 3000;
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 768 * 1024;
const MAX_LARGE_CONFIG_BYTES = 6 * 1024 * 1024;
const MAX_FIX_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_FIX_ENTRIES = 2500;
const MAX_FIX_ENTRY_BYTES = 12 * 1024 * 1024;
const MAX_FIX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_EVIDENCE_ENTRY_BYTES = 48 * 1024 * 1024;
const MAX_EVIDENCE_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;

const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', 'out', 'coverage', 'reports', 'checkpoints', 'baselines',
  '.cache', '.turbo', '.parcel-cache', '.vite', '.idea', '.vscode', 'vendor', '__pycache__',
  'fix-backups', 'backup', 'backups', 'audits',
]);
const LARGE_CONFIG_NAMES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']);
const SAFE_BASENAMES = new Set([
  'dockerfile', 'makefile', 'procfile', 'package.json', 'tsconfig.json', 'jsconfig.json', 'vite.config.ts', 'vite.config.js',
  'next.config.ts', 'next.config.js', 'next.config.mjs', 'astro.config.ts', 'svelte.config.js', 'tailwind.config.ts',
  'tailwind.config.js', 'postcss.config.js', 'eslint.config.js', 'eslint.config.mjs', '.eslintrc', '.prettierrc',
]);
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.sass', '.less', '.html', '.htm', '.json', '.md', '.txt',
  '.yaml', '.yml', '.toml', '.xml', '.svg', '.php', '.py', '.rb', '.go', '.java', '.kt', '.kts', '.vue', '.svelte', '.astro',
  '.sh', '.bat', '.cmd', '.ps1', '.ini', '.conf', '.properties', '.graphql', '.gql',
]);
const SENSITIVE_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore', '.crt', '.cer']);
const SENSITIVE_CONFIG_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.properties', '.txt']);
const SENSITIVE_CONFIG_STEM_RE = /(?:^|[._-])(?:credential(?:s)?|secret(?:s)?|password(?:s)?|passwd|token(?:s)?|api[._-]?key(?:s)?|service[._-]?account|private[._-]?key)(?:$|[._-])/i;
const VERIFICATION_CONTROL_FILES = new Set(['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']);
const SHA256_RE = /^[a-f0-9]{64}$/;
const FIX_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const BACKUP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const WINDOWS_RESERVED_BASENAME_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

interface SourceFileSnapshot {
  path: string;
  archiveEntry: string;
  bytes: number;
  sha256: string;
  content: Buffer;
}

interface WorkspaceSnapshot {
  root: string;
  projectName: string;
  files: SourceFileSnapshot[];
  totalBytes: number;
  fingerprint: string;
  skippedSensitive: number;
  skippedLarge: number;
  skippedUnsupported: number;
}

export interface WorkspaceInspection {
  ok: true;
  projectName: string;
  fileCount: number;
  totalBytes: number;
  fingerprint: string;
  skippedSensitive: number;
  skippedLarge: number;
  skippedUnsupported: number;
  warnings: string[];
}

export interface FixVerificationCommand {
  script: string;
  command: string;
  status: 'PASS' | 'FAILED' | 'NOT_AVAILABLE' | 'TIMEOUT';
  exitCode: number | null;
  output: string;
}

export interface FixVerificationResult {
  status: 'PASS' | 'FAILED' | 'NOT_CONFIGURED' | 'NOT_VERIFIED';
  packageManager: string | null;
  commands: FixVerificationCommand[];
  note: string;
}

export interface AppliedFixResult {
  fixId: string;
  backupId: string;
  appliedFiles: string[];
  verification: FixVerificationResult;
  warnings: string[];
}

export interface FixBackupSummary {
  backupId: string;
  fixId: string;
  createdAt: string;
  rolledBackAt?: string;
  fileCount: number;
}

export interface FixBackupList {
  backups: FixBackupSummary[];
  warnings: string[];
}

interface FixOperation {
  id: string;
  action: 'replace' | 'create';
  path: string;
  archiveEntry: string;
  beforeSha256?: string;
  afterSha256: string;
}

interface FixManifest {
  schemaVersion: 2;
  fixId: string;
  summary: string;
  sourcePackFingerprint: string;
  sourcePackBinding: string;
  operations: FixOperation[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const extra = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (extra.length) throw new Error(`${label} contains unsupported fields: ${extra.join(', ')}`);
}

function parseFixManifest(raw: unknown): FixManifest {
  if (!isRecord(raw)) throw new Error('Manifest must be an object.');
  assertExactKeys(raw, ['schemaVersion', 'fixId', 'summary', 'sourcePackFingerprint', 'sourcePackBinding', 'operations'], 'Manifest');
  if (raw.schemaVersion !== 2) throw new Error('Unsupported manifest schemaVersion. Generate a new Fix Pack from this release.');
  if (typeof raw.fixId !== 'string' || !FIX_ID_RE.test(raw.fixId)) throw new Error('Invalid fixId.');
  if (typeof raw.summary !== 'string' || raw.summary.length < 1 || raw.summary.length > 2000) throw new Error('Invalid summary.');
  if (typeof raw.sourcePackFingerprint !== 'string' || !SHA256_RE.test(raw.sourcePackFingerprint)) throw new Error('sourcePackFingerprint is required and must be SHA-256.');
  if (typeof raw.sourcePackBinding !== 'string' || !SHA256_RE.test(raw.sourcePackBinding)) throw new Error('sourcePackBinding is required.');
  if (!Array.isArray(raw.operations) || raw.operations.length < 1 || raw.operations.length > 200) throw new Error('operations must contain 1–200 items.');
  const ids = new Set<string>();
  const paths = new Set<string>();
  const entries = new Set<string>();
  const operations: FixOperation[] = raw.operations.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Operation ${index + 1} must be an object.`);
    assertExactKeys(item, ['id', 'action', 'path', 'archiveEntry', 'beforeSha256', 'afterSha256'], `Operation ${index + 1}`);
    if (typeof item.id !== 'string' || !FIX_ID_RE.test(item.id) || WINDOWS_RESERVED_BASENAME_RE.test(`${item.id}.bin`)) throw new Error(`Operation ${index + 1}: invalid id.`);
    if (item.action !== 'replace' && item.action !== 'create') throw new Error(`Operation ${index + 1}: unsupported action.`);
    if (typeof item.path !== 'string' || item.path.length < 1 || item.path.length > 1024) throw new Error(`Operation ${index + 1}: invalid path.`);
    if (typeof item.archiveEntry !== 'string' || !/^files\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(item.archiveEntry)) throw new Error(`Operation ${index + 1}: invalid archiveEntry.`);
    if (typeof item.afterSha256 !== 'string' || !SHA256_RE.test(item.afterSha256)) throw new Error(`Operation ${index + 1}: invalid afterSha256.`);
    if (item.action === 'replace' && (typeof item.beforeSha256 !== 'string' || !SHA256_RE.test(item.beforeSha256))) throw new Error(`Operation ${index + 1}: replace requires beforeSha256.`);
    if (item.action === 'create' && item.beforeSha256 !== undefined) throw new Error(`Operation ${index + 1}: create must not declare beforeSha256.`);
    const normalized = normalizeRelativePath(item.path);
    const pathKey = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    const idKey = item.id.toLowerCase();
    const entryKey = item.archiveEntry.toLowerCase();
    if (ids.has(idKey)) throw new Error(`Operation ${index + 1}: duplicate id.`);
    if (paths.has(pathKey)) throw new Error(`Operation ${index + 1}: duplicate target path.`);
    if (entries.has(entryKey)) throw new Error(`Operation ${index + 1}: duplicate archiveEntry.`);
    ids.add(idKey); paths.add(pathKey); entries.add(entryKey);
    return {
      id: item.id,
      action: item.action,
      path: normalized,
      archiveEntry: item.archiveEntry,
      ...(item.beforeSha256 === undefined ? {} : { beforeSha256: item.beforeSha256 as string }),
      afterSha256: item.afterSha256,
    };
  });
  return {
    schemaVersion: 2,
    fixId: raw.fixId,
    summary: raw.summary,
    sourcePackFingerprint: raw.sourcePackFingerprint,
    sourcePackBinding: raw.sourcePackBinding,
    operations,
  };
}

interface BackupManifest {
  schemaVersion: 2;
  backupId: string;
  fixId: string;
  projectRootHash: string;
  createdAt: string;
  rolledBackAt?: string;
  operations: Array<{
    id: string;
    action: 'replace' | 'create';
    path: string;
    afterSha256: string;
    backupEntry?: string;
    originalSha256?: string;
    originalMode?: number;
    createdDirs?: string[];
  }>;
}

function parseBackupManifest(raw: unknown, expectedBackupId: string): BackupManifest {
  if (!isRecord(raw)) throw new Error('Backup manifest must be an object.');
  assertExactKeys(raw, ['schemaVersion', 'backupId', 'fixId', 'projectRootHash', 'createdAt', 'rolledBackAt', 'operations'], 'Backup manifest');
  if (raw.schemaVersion !== 2) throw new Error('Unsupported or legacy backup manifest schemaVersion.');
  if (raw.backupId !== expectedBackupId || typeof raw.backupId !== 'string' || !BACKUP_ID_RE.test(raw.backupId)) throw new Error('Backup manifest identifier mismatch.');
  if (typeof raw.fixId !== 'string' || !FIX_ID_RE.test(raw.fixId)) throw new Error('Backup manifest has invalid fixId.');
  if (typeof raw.projectRootHash !== 'string' || !SHA256_RE.test(raw.projectRootHash)) throw new Error('Backup manifest has invalid projectRootHash.');
  if (typeof raw.createdAt !== 'string' || raw.createdAt.length < 1 || raw.createdAt.length > 80) throw new Error('Backup manifest has invalid createdAt.');
  if (raw.rolledBackAt !== undefined && (typeof raw.rolledBackAt !== 'string' || raw.rolledBackAt.length < 1 || raw.rolledBackAt.length > 80)) throw new Error('Backup manifest has invalid rolledBackAt.');
  if (!Array.isArray(raw.operations) || raw.operations.length < 1 || raw.operations.length > 200) throw new Error('Backup manifest has invalid operations.');
  const ids = new Set<string>();
  const paths = new Set<string>();
  const operations: BackupManifest['operations'] = raw.operations.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Backup operation ${index + 1} must be an object.`);
    assertExactKeys(item, ['id', 'action', 'path', 'afterSha256', 'backupEntry', 'originalSha256', 'originalMode', 'createdDirs'], `Backup operation ${index + 1}`);
    if (typeof item.id !== 'string' || !FIX_ID_RE.test(item.id)) throw new Error(`Backup operation ${index + 1}: invalid id.`);
    if (item.action !== 'replace' && item.action !== 'create') throw new Error(`Backup operation ${index + 1}: invalid action.`);
    if (typeof item.path !== 'string') throw new Error(`Backup operation ${index + 1}: invalid path.`);
    const normalized = normalizeRelativePath(item.path);
    const pathKey = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    const idKey = item.id.toLowerCase();
    if (ids.has(idKey) || paths.has(pathKey)) throw new Error(`Backup operation ${index + 1}: duplicate id/path.`);
    ids.add(idKey); paths.add(pathKey);
    if (typeof item.afterSha256 !== 'string' || !SHA256_RE.test(item.afterSha256)) throw new Error(`Backup operation ${index + 1}: invalid afterSha256.`);
    if (item.action === 'replace') {
      if (item.backupEntry !== `files/${item.id}.bin`) throw new Error(`Backup operation ${index + 1}: invalid backupEntry.`);
      if (typeof item.originalSha256 !== 'string' || !SHA256_RE.test(item.originalSha256)) throw new Error(`Backup operation ${index + 1}: invalid originalSha256.`);
      if (item.originalMode !== undefined && (!Number.isInteger(item.originalMode) || (item.originalMode as number) < 0 || (item.originalMode as number) > 0o777)) throw new Error(`Backup operation ${index + 1}: invalid originalMode.`);
      if (item.createdDirs !== undefined) throw new Error(`Backup operation ${index + 1}: replace cannot contain createdDirs.`);
      return {
        id: item.id,
        action: 'replace',
        path: normalized,
        afterSha256: item.afterSha256,
        backupEntry: item.backupEntry,
        originalSha256: item.originalSha256,
        ...(item.originalMode === undefined ? {} : { originalMode: item.originalMode as number }),
      };
    }
    if (item.backupEntry !== undefined || item.originalSha256 !== undefined || item.originalMode !== undefined) throw new Error(`Backup operation ${index + 1}: create cannot contain backup metadata.`);
    const createdDirs = item.createdDirs === undefined ? [] : item.createdDirs;
    if (!Array.isArray(createdDirs) || createdDirs.length > 64 || createdDirs.some((value) => typeof value !== 'string')) throw new Error(`Backup operation ${index + 1}: invalid createdDirs.`);
    const normalizedDirs = (createdDirs as string[]).map((value) => normalizeRelativePath(value));
    if (new Set(normalizedDirs.map((value) => process.platform === 'win32' ? value.toLowerCase() : value)).size !== normalizedDirs.length) throw new Error(`Backup operation ${index + 1}: duplicate createdDirs.`);
    return { id: item.id, action: 'create', path: normalized, afterSha256: item.afterSha256, ...(normalizedDirs.length ? { createdDirs: normalizedDirs } : {}) };
  });
  return {
    schemaVersion: 2,
    backupId: raw.backupId,
    fixId: raw.fixId,
    projectRootHash: raw.projectRootHash,
    createdAt: raw.createdAt,
    ...(raw.rolledBackAt === undefined ? {} : { rolledBackAt: raw.rolledBackAt as string }),
    operations,
  };
}

function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function normalizeRelativePath(value: string): string {
  if (value.includes('\0')) throw new Error('NUL is not allowed in file paths.');
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) throw new Error('Absolute paths are not allowed.');
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error('Path traversal is not allowed.');
  if (parts.some((part) => part.length > 255 || /[<>:"|?*]/.test(part) || /[ .]$/.test(part) || WINDOWS_RESERVED_BASENAME_RE.test(part))) {
    throw new Error('Path contains a Windows-unsafe component.');
  }
  return parts.join('/');
}

function absoluteInside(root: string, relative: string): string {
  const normalized = normalizeRelativePath(relative);
  const absolute = path.resolve(root, ...normalized.split('/'));
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) throw new Error('Path escapes project root.');
  return absolute;
}

async function assertNoSymlinkPath(root: string, relative: string, allowMissingLeaf: boolean): Promise<void> {
  const parts = normalizeRelativePath(relative).split('/');
  let current = root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]!);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlink path is not allowed: ${relative}`);
      if (index < parts.length - 1 && !stat.isDirectory()) throw new Error(`Parent path is not a directory: ${relative}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
      if (index === parts.length - 1 && !allowMissingLeaf) throw new Error(`Target file does not exist: ${relative}`);
      return;
    }
  }
}

function isSensitivePath(relative: string): boolean {
  const normalized = normalizeRelativePath(relative);
  const parts = normalized.toLowerCase().split('/');
  if (parts.some((part) => EXCLUDED_DIRS.has(part))) return true;
  if (parts.some((part) => part === '.ssh' || part === '.gnupg' || part === 'secrets' || part === 'credentials' || part === 'private')) return true;
  const base = parts.at(-1) ?? '';
  if (base === '.env' || base.startsWith('.env.') || base === '.npmrc' || base === '.pypirc' || base === '.netrc' || base === 'id_rsa' || base === 'id_ed25519') return true;
  if (SENSITIVE_EXTENSIONS.has(path.posix.extname(base))) return true;
  const extension = path.posix.extname(base);
  const stem = extension ? base.slice(0, -extension.length) : base;
  if (SENSITIVE_CONFIG_EXTENSIONS.has(extension) && SENSITIVE_CONFIG_STEM_RE.test(stem)) return true;
  return false;
}

function safeDecodeURIComponent(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  if (!normalized) return true;
  return /^(?:process\.env|import\.meta\.env)[.\[]/.test(normalized)
    || /^\$\{(?:process\.env|[a-z_][\w]*)\}$/i.test(normalized)
    || /^<[a-z_][\w-]*>$/i.test(normalized)
    || /^(?:your[_-][\w-]+|placeholder|changeme|change-me|\*{3,}|\[redacted\])$/i.test(normalized);
}

function containsHighConfidenceSecret(content: Buffer): boolean {
  const text = content.toString('utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
    || /\bAKIA[0-9A-Z]{16}\b/.test(text)
    || /\bgh[pousr]_[A-Za-z0-9]{30,}\b/.test(text)
    || /\bsk-[A-Za-z0-9_-]{20,}\b/.test(text)
    || /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/.test(text)
    || /"client_secret"\s*:\s*"[^"\r\n]{12,}"/i.test(text)
    || /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp|amqps):\/\/[^\s/:@]+:[^\s/@]{4,}@/i.test(text)) return true;

  if (/\b(?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic|digest)\s+[^\s"'\r\n,;]{4,}/i.test(text)
    || /\b(?:cookie|set-cookie)\s*:\s*[^\r\n]{4,}/i.test(text)
    || /\b(?:x[-_]?api[-_]?key|x[-_]?auth[-_]?token)\s*[:=]\s*[^\s"'\r\n,;]{4,}/i.test(text)) return true;

  const secretKey = String.raw`(?:password|passwd|pwd|token|secret|session|x[-_]?api[-_]?key|x[-_]?auth[-_]?token|api[_-]?key|apiKey|access[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|session[_-]?id|database[_-]?url|db[_-]?url|dsn|aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)`;
  const quotedSecret = new RegExp(`["']?${secretKey}["']?\\s*[:=]\\s*["']([^"'\\r\\n]{1,})["']`, 'gi');
  for (const match of text.matchAll(quotedSecret)) {
    const value = match[1] ?? '';
    if (!isPlaceholderSecret(value)) return true;
  }
  const unquotedSecret = new RegExp(`(?:^|[\\s{,])["']?${secretKey}["']?\\s*[:=]\\s*([^\\s#;,}\\]]{4,})`, 'gim');
  for (const match of text.matchAll(unquotedSecret)) {
    const value = match[1] ?? '';
    if (!isPlaceholderSecret(value)) return true;
  }
  const urlQuerySecret = /[?&](?:token|access_token|auth|authorization|api_key|apikey|secret|session|sid|password|signature|sig|key)=([^&#\s"'<>]{8,})/gi;
  for (const match of text.matchAll(urlQuerySecret)) {
    const value = safeDecodeURIComponent(match[1] ?? '');
    if (!isPlaceholderSecret(value)) return true;
  }
  const basicAuthUrl = /https?:\/\/[^\s/:@]+:([^\s/@]{4,})@/gi;
  for (const match of text.matchAll(basicAuthUrl)) {
    const value = safeDecodeURIComponent(match[1] ?? '');
    if (!isPlaceholderSecret(value)) return true;
  }
  return false;
}

function isSupportedSource(relative: string, bytes: number): 'YES' | 'LARGE' | 'NO' {
  const base = path.posix.basename(relative).toLowerCase();
  if (LARGE_CONFIG_NAMES.has(base)) return bytes <= MAX_LARGE_CONFIG_BYTES ? 'YES' : 'LARGE';
  if (SAFE_BASENAMES.has(base)) return bytes <= MAX_SOURCE_FILE_BYTES ? 'YES' : 'LARGE';
  if (!SOURCE_EXTENSIONS.has(path.posix.extname(base))) return 'NO';
  return bytes <= MAX_SOURCE_FILE_BYTES ? 'YES' : 'LARGE';
}

function isTextSource(content: Buffer): boolean {
  return !content.includes(0) && Buffer.from(content.toString('utf8'), 'utf8').equals(content);
}

async function resolveProjectRoot(projectRoot: string): Promise<string> {
  if (!projectRoot.trim()) throw new Error('Укажите папку локального проекта.');
  const resolved = path.resolve(projectRoot.trim());
  const real = await fs.realpath(resolved);
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new Error('Путь проекта должен указывать на папку.');
  const parsed = path.parse(real);
  if (real === parsed.root) throw new Error('Корень диска нельзя использовать как папку проекта.');
  return real;
}

async function collectWorkspace(projectRoot: string): Promise<WorkspaceSnapshot> {
  const root = await resolveProjectRoot(projectRoot);
  const candidates: Array<{ relative: string; absolute: string; bytes: number }> = [];
  let skippedSensitive = 0;
  let skippedLarge = 0;
  let skippedUnsupported = 0;

  const walk = async (directory: string, relativeDir = '', depth = 0): Promise<void> => {
    if (depth > 32) throw new Error('Project directory nesting is too deep.');
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) { skippedUnsupported += 1; continue; }
      const relative = normalizeRelativePath(relativeDir ? `${relativeDir}/${entry.name}` : entry.name);
      if (isSensitivePath(relative)) { skippedSensitive += 1; continue; }
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, relative, depth + 1);
        continue;
      }
      if (!entry.isFile()) { skippedUnsupported += 1; continue; }
      await assertNoSymlinkPath(root, relative, false);
      const stat = await fs.lstat(absolute);
      if (!stat.isFile()) { skippedUnsupported += 1; continue; }
      const support = isSupportedSource(relative, stat.size);
      if (support === 'NO') { skippedUnsupported += 1; continue; }
      if (support === 'LARGE') { skippedLarge += 1; continue; }
      candidates.push({ relative, absolute, bytes: stat.size });
      if (candidates.length > MAX_SOURCE_FILES) throw new Error(`Слишком много source-файлов: лимит ${MAX_SOURCE_FILES}. Укажите более узкую папку проекта.`);
    }
  };
  await walk(root);
  let totalBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
  if (totalBytes > MAX_SOURCE_BYTES) throw new Error(`Исходники для ChatGPT превышают ${Math.round(MAX_SOURCE_BYTES / 1024 / 1024)} MB. Укажите более узкую папку проекта.`);
  const files: SourceFileSnapshot[] = [];
  const fingerprint = crypto.createHash('sha256');
  for (const candidate of candidates) {
    await assertNoSymlinkPath(root, candidate.relative, false);
    if (await fs.realpath(candidate.absolute) !== candidate.absolute) throw new Error('FILESYSTEM_ESCAPE: source path changed during export.');
    const handle = await fs.open(candidate.absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    let content: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size !== candidate.bytes) throw new Error('STALE_SOURCE: source file changed during export.');
      content = await handle.readFile();
    } finally { await handle.close(); }
    await assertNoSymlinkPath(root, candidate.relative, false);
    if (await fs.realpath(candidate.absolute) !== candidate.absolute || content.length !== candidate.bytes) {
      throw new Error('FILESYSTEM_ESCAPE: source path changed during export.');
    }
    if (!isTextSource(content)) { skippedUnsupported += 1; continue; }
    if (containsHighConfidenceSecret(content)) { skippedSensitive += 1; continue; }
    const hash = sha256(content);
    const archiveEntry = `source/${String(files.length + 1).padStart(5, '0')}.txt`;
    files.push({ path: candidate.relative, archiveEntry, bytes: content.length, sha256: hash, content });
    fingerprint.update(candidate.relative); fingerprint.update('\0'); fingerprint.update(hash); fingerprint.update('\0');
  }
  totalBytes = files.reduce((sum, item) => sum + item.bytes, 0);
  if (!files.length) throw new Error('В указанной папке не найдено поддерживаемых исходников.');
  return { root, projectName: path.basename(root), files, totalBytes, fingerprint: fingerprint.digest('hex'), skippedSensitive, skippedLarge, skippedUnsupported };
}

export async function inspectWorkspace(projectRoot: string): Promise<WorkspaceInspection> {
  const snapshot = await collectWorkspace(projectRoot);
  const warnings: string[] = [];
  if (snapshot.skippedSensitive) warnings.push(`Исключено потенциально секретных/служебных путей: ${snapshot.skippedSensitive}.`);
  if (snapshot.skippedLarge) warnings.push(`Исключено слишком больших текстовых файлов: ${snapshot.skippedLarge}.`);
  if (snapshot.skippedUnsupported) warnings.push(`Исключено неподдерживаемых/бинарных элементов: ${snapshot.skippedUnsupported}.`);
  return {
    ok: true,
    projectName: snapshot.projectName,
    fileCount: snapshot.files.length,
    totalBytes: snapshot.totalBytes,
    fingerprint: snapshot.fingerprint,
    skippedSensitive: snapshot.skippedSensitive,
    skippedLarge: snapshot.skippedLarge,
    skippedUnsupported: snapshot.skippedUnsupported,
    warnings,
  };
}

async function readOptional(filePath: string): Promise<Buffer | null> {
  try { return await fs.readFile(filePath); } catch { return null; }
}


function sanitizeEvidenceZipForExternalUpload(buffer: Buffer): Buffer {
  const sanitized: ZipEntry[] = [];
  for (const [name, content] of readZipEntries(buffer, { maxEntryBytes: MAX_EVIDENCE_ENTRY_BYTES, maxUncompressedBytes: MAX_EVIDENCE_UNCOMPRESSED_BYTES })) {
    sanitized.push({ name, content: sanitizeExternalArtifact(name, content) });
  }
  return storedZip(sanitized);
}

function externalAuditJob(job: AuditJob): Record<string, unknown> {
  return sanitizeExternalJson({
    id: job.id,
    url: redactUrlForExternalEvidence(job.url),
    preset: job.preset,
    configuration: job.configuration,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  }) as Record<string, unknown>;
}

export async function buildChatGptFixPack(rootDir: string, projectRoot: string, reportDir: string, job: AuditJob): Promise<{ buffer: Buffer; filename: string; inspection: WorkspaceInspection }> {
  if (!['PASS', 'ISSUE', 'PARTIAL', 'NOT_VERIFIED'].includes(job.status) || !job.finishedAt || !job.reportUrl) {
    throw new Error('Fix Pack требует завершённый аудит с отчётом.');
  }
  const snapshot = await collectWorkspace(projectRoot);
  const sourcePackBinding = await signWorkspaceSnapshot(rootDir, snapshot.root, snapshot.fingerprint);
  const inspection: WorkspaceInspection = {
    ok: true,
    projectName: snapshot.projectName,
    fileCount: snapshot.files.length,
    totalBytes: snapshot.totalBytes,
    fingerprint: snapshot.fingerprint,
    skippedSensitive: snapshot.skippedSensitive,
    skippedLarge: snapshot.skippedLarge,
    skippedUnsupported: snapshot.skippedUnsupported,
    warnings: [
      ...(snapshot.skippedSensitive ? [`Исключено потенциально секретных/служебных путей: ${snapshot.skippedSensitive}.`] : []),
      ...(snapshot.skippedLarge ? [`Исключено слишком больших текстовых файлов: ${snapshot.skippedLarge}.`] : []),
      ...(snapshot.skippedUnsupported ? [`Исключено неподдерживаемых/бинарных элементов: ${snapshot.skippedUnsupported}.`] : []),
    ],
  };
  const workspaceManifest = {
    schemaVersion: 1,
    projectName: 'local-project',
    createdAt: new Date().toISOString(),
    fingerprint: snapshot.fingerprint,
    sourcePackBinding,
    fileCount: snapshot.files.length,
    totalBytes: snapshot.totalBytes,
    exclusions: { sensitive: snapshot.skippedSensitive, large: snapshot.skippedLarge, unsupported: snapshot.skippedUnsupported },
    files: snapshot.files.map(({ path: filePath, archiveEntry, bytes, sha256: hash }) => ({ path: filePath, archiveEntry, bytes, sha256: hash })),
  };
  const returnSpec = {
    schemaVersion: 2,
    outputFilename: 'VQB-FIX-<fixId>.zip',
    rootEntry: 'fix-manifest.json',
    allowedActions: ['replace', 'create'],
    forbiddenActions: ['delete', 'rename', 'shell-command'],
    manifestExample: {
      schemaVersion: 2,
      fixId: 'fix-short-name',
      summary: 'Minimal evidence-driven correction.',
      sourcePackFingerprint: snapshot.fingerprint,
      sourcePackBinding,
      operations: [{
        id: 'F001', action: 'replace', path: 'src/example.ts', archiveEntry: 'files/F001.txt',
        beforeSha256: '<sha256 from workspace-manifest.json>', afterSha256: '<sha256 of files/F001.txt>',
      }],
    },
    rules: [
      'Change only files required by confirmed evidence.',
      'sourcePackFingerprint is mandatory and must equal workspace-manifest.json fingerprint.',
      'Copy sourcePackBinding exactly from workspace-manifest.json; it binds this export to the selected local project.',
      'Use exact beforeSha256 from workspace-manifest.json for every replace operation.',
      'Do not include secrets, dependencies, generated build output, or unrelated refactors.',
      'Each archiveEntry must be files/<safe-id> and must match afterSha256.',
    ],
  };
  const readme = [
    'VISUAL QA BROWSER — CHATGPT FIX PACK',
    '',
    'ЦЕЛЬ: проверить evidence, найти root cause и вернуть минимальный безопасный VQB fix package.',
    'Пользователь хочет, чтобы исправления проектировал и выполнял ChatGPT, а локальная программа только безопасно применяла пакет.',
    '',
    'ОБЯЗАТЕЛЬНО:',
    '1. Сначала изучить audit/gpt-evidence.zip и prompts; BUG и CAND не смешивать.',
    '2. Проверить исходники из workspace-manifest.json + source/*.txt.',
    '3. Не исправлять CAND как подтверждённый BUG без дополнительного доказательства.',
    '4. Минимальный blast radius: без нерелевантного рефакторинга.',
    '5. Вернуть ZIP по RETURN_FIX_PACKAGE_SPEC.json.',
    '6. Для replace beforeSha256 брать ТОЧНО из workspace-manifest.json.',
    '7. Не включать delete/rename/shell operations.',
    '',
    `Audit job: ${job.id}`,
    `Target: ${redactUrlForExternalEvidence(job.url)}`,
    `Workspace fingerprint: ${snapshot.fingerprint}`,
  ].join('\n');
  const entries: ZipEntry[] = [
    { name: 'README_FOR_CHATGPT.txt', content: Buffer.from(`${readme}\n`) },
    { name: 'workspace-manifest.json', content: Buffer.from(`${JSON.stringify(workspaceManifest, null, 2)}\n`) },
    { name: 'RETURN_FIX_PACKAGE_SPEC.json', content: Buffer.from(`${JSON.stringify(returnSpec, null, 2)}\n`) },
    { name: 'audit-job.json', content: Buffer.from(`${JSON.stringify(externalAuditJob(job), null, 2)}\n`) },
  ];
  const evidenceZip = await readOptional(path.join(reportDir, 'gpt-evidence.zip'));
  const technicalPrompt = await readOptional(path.join(reportDir, 'gpt-fix-prompt.txt'));
  if (!evidenceZip || !technicalPrompt) throw new Error('Аудит не содержит обязательный gpt-evidence.zip / gpt-fix-prompt.txt. Fix Pack не создан.');
  entries.push({ name: 'audit/gpt-evidence.zip', content: sanitizeEvidenceZipForExternalUpload(evidenceZip) }, { name: 'audit/gpt-fix-prompt.txt', content: sanitizeExternalArtifact('gpt-fix-prompt.txt', technicalPrompt) });
  for (const name of ['gpt-premium-fix-prompt.txt', 'defects.json', 'candidates.json', 'root-cause-hypotheses.json', 'art-direction.json', 'art-direction-evidence.json']) {
    const content = await readOptional(path.join(reportDir, name));
    if (content) entries.push({ name: `audit/${name}`, content: sanitizeExternalArtifact(name, content) });
  }
  for (const file of snapshot.files) entries.push({ name: file.archiveEntry, content: file.content });
  const buffer = storedZip(entries);
  if (buffer.length > MAX_FIX_ZIP_BYTES) throw new Error('Fix Pack превышает безопасный лимит размера. Укажите более узкую папку проекта.');
  const shortJob = job.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'audit';
  return { buffer, filename: `VQB-CHATGPT-FIX-PACK-${shortJob}.zip`, inspection };
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0);
  return (crc ^ 0xffffffff) >>> 0;
}

export function readZipEntries(buffer: Buffer, limits: { maxEntryBytes?: number; maxUncompressedBytes?: number; maxEntries?: number } = {}): Map<string, Buffer> {
  const maxEntryBytes = limits.maxEntryBytes ?? MAX_FIX_ENTRY_BYTES;
  const maxUncompressedBytes = limits.maxUncompressedBytes ?? MAX_FIX_UNCOMPRESSED_BYTES;
  const maxEntries = limits.maxEntries ?? MAX_FIX_ENTRIES;
  if (buffer.length < 22) throw new Error('Invalid ZIP: file is too small.');
  if (buffer.length > MAX_FIX_ZIP_BYTES) throw new Error('ZIP exceeds the safe size limit.');
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= min; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('Invalid ZIP: end-of-central-directory not found.');
  if (eocd + 22 + buffer.readUInt16LE(eocd + 20) !== buffer.length) throw new Error('Invalid ZIP trailing data.');
  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) throw new Error('Multi-disk ZIP archives are not supported.');
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported.');
  if (entryCount > maxEntries) throw new Error('ZIP has too many entries.');
  if (directoryOffset + directorySize > eocd) throw new Error('Invalid ZIP central directory bounds.');
  const result = new Map<string, Buffer>();
  const seenNames = new Set<string>();
  let cursor = directoryOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory entry.');
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const diskStart = buffer.readUInt16LE(cursor + 34);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    if ((flags & 0x1) !== 0) throw new Error('Encrypted ZIP entries are not supported.');
    if (flags & ~(0x8 | 0x800)) throw new Error('Unsupported ZIP general-purpose flags.');
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression method: ${method}.`);
    if (diskStart !== 0) throw new Error('Multi-disk ZIP entries are not supported.');
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) throw new Error('ZIP64 entries are not supported.');
    if (compressedSize > maxEntryBytes || uncompressedSize > maxEntryBytes) throw new Error('ZIP entry exceeds the safe per-file limit.');
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > buffer.length) throw new Error('Invalid ZIP entry name bounds.');
    const rawName = buffer.subarray(cursor + 46, nameEnd).toString('utf8');
    if (!rawName || !/^[\x20-\x7E]+$/.test(rawName)) throw new Error('ZIP entry names must use safe ASCII characters.');
    const isDirectory = rawName.endsWith('/');
    const name = normalizeRelativePath(isDirectory ? rawName.slice(0, -1) : rawName);
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) throw new Error('Duplicate ZIP entry (Windows case-insensitive collision).');
    seenNames.add(nameKey);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Invalid ZIP local header.');
    if (buffer.readUInt16LE(localOffset + 6) !== flags || buffer.readUInt16LE(localOffset + 8) !== method) throw new Error('ZIP central/local flags or method mismatch.');
    if (!(flags & 0x8) && (buffer.readUInt32LE(localOffset + 14) !== expectedCrc || buffer.readUInt32LE(localOffset + 18) !== compressedSize || buffer.readUInt32LE(localOffset + 22) !== uncompressedSize)) {
      throw new Error('ZIP central/local CRC or size mismatch.');
    }
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    if (localNameEnd > buffer.length || dataStart > buffer.length) throw new Error('Invalid ZIP local header bounds.');
    if (buffer.subarray(localNameStart, localNameEnd).toString('utf8') !== rawName) throw new Error('ZIP central/local entry name mismatch.');
    for (const [start, length] of [[nameEnd, extraLength], [localNameEnd, localExtraLength]] as Array<[number, number]>) {
      let at = start;
      while (at < start + length) {
        if (at + 4 > start + length) throw new Error('Malformed ZIP extra field.');
        const type = buffer.readUInt16LE(at);
        const fieldLength = buffer.readUInt16LE(at + 2);
        if (type === 0x0001) throw new Error('ZIP64 extra fields are not supported.');
        at += 4 + fieldLength;
        if (at > start + length) throw new Error('Malformed ZIP extra field.');
      }
    }
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) throw new Error('Invalid ZIP data bounds.');
    const compressed = buffer.subarray(dataStart, dataEnd);
    const content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: maxEntryBytes });
    if (content.length !== uncompressedSize) throw new Error('ZIP entry size mismatch.');
    if (crc32(content) !== expectedCrc) throw new Error('ZIP entry CRC mismatch.');
    uncompressedTotal += content.length;
    if (uncompressedTotal > maxUncompressedBytes) throw new Error('ZIP uncompressed content exceeds safe limit.');
    if (isDirectory) {
      if (content.length !== 0) throw new Error('ZIP directory entry must be empty.');
    } else {
      result.set(name, content);
    }
    cursor = nameEnd + extraLength + commentLength;
  }
  if (cursor !== directoryOffset + directorySize) throw new Error('Invalid ZIP central directory size.');
  return result;
}

const SAFE_JSON_EXTENSIONS = new Set(['.json']);
const EXECUTABLE_SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.php', '.py', '.rb', '.go', '.java', '.kt', '.kts',
  '.vue', '.svelte', '.astro', '.sh', '.bat', '.cmd', '.ps1',
]);

async function exists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; } catch { return false; }
}

const activeProjectMutations = new Set<string>();
async function withProjectMutationLock<T>(projectRoot: string, operation: () => Promise<T>): Promise<T> {
  const key = process.platform === 'win32' ? projectRoot.toLowerCase() : projectRoot;
  if (activeProjectMutations.has(key)) throw new Error('PROJECT_BUSY: другой Fix Bridge apply/rollback уже выполняется для этой папки.');
  activeProjectMutations.add(key);
  try { return await operation(); }
  finally { activeProjectMutations.delete(key); }
}

function nonExecutingPrecheck(prepared: PreparedFixItem[]): FixVerificationResult {
  const commands: FixVerificationCommand[] = [];
  let requiresRuntimeVerification = false;

  for (const item of prepared) {
    const ext = path.posix.extname(item.relative).toLowerCase();
    const base = path.posix.basename(item.relative).toLowerCase();
    if (SAFE_JSON_EXTENSIONS.has(ext)) {
      try { JSON.parse(item.content.toString('utf8')); }
      catch (error) {
        commands.push({
          script: `parse:${item.relative}`,
          command: 'internal JSON.parse (no project code executed)',
          status: 'FAILED',
          exitCode: null,
          output: error instanceof Error ? error.message : 'Invalid JSON.',
        });
        return {
          status: 'FAILED', packageManager: null, commands,
          note: `Безопасный precheck отклонил ${item.relative}: JSON синтаксически некорректен. Проект не изменён.`,
        };
      }
      commands.push({
        script: `parse:${item.relative}`,
        command: 'internal JSON.parse (no project code executed)',
        status: 'PASS',
        exitCode: 0,
        output: 'Valid JSON.',
      });
    }
    if (EXECUTABLE_SOURCE_EXTENSIONS.has(ext) || VERIFICATION_CONTROL_FILES.has(base)) requiresRuntimeVerification = true;
  }

  if (requiresRuntimeVerification) {
    return {
      status: 'NOT_VERIFIED', packageManager: null, commands,
      note: 'Безопасный precheck выполнен без запуска кода проекта. Автоматические typecheck/lint/test/build отключены: временная копия не является OS sandbox, поэтому исполнять project scripts автоматически небезопасно. Runtime/build verification требуется отдельно.',
    };
  }

  return {
    status: 'PASS', packageManager: null, commands,
    note: 'Неисполняющий precheck PASS: проверены доступные структурные инварианты, project scripts и исходный код не запускались.',
  };
}

interface PreparedFixItem {
  operation: FixOperation;
  relative: string;
  target: string;
  content: Buffer;
  originalMode?: number;
  createdDirs: string[];
}

async function verifyPreparedFixSafely(prepared: PreparedFixItem[]): Promise<FixVerificationResult> {
  return nonExecutingPrecheck(prepared);
}

/** Each commit validates the displaced bytes. Creation uses exclusive hard-linking so a racing
 * file cannot be overwritten. A concurrent external process can still swap ancestor directories;
 * parent checks before and after mkdir make the known race fail closed at that point. */
async function ensureSafeParent(projectRoot: string, target: string): Promise<void> {
  const relative = path.relative(projectRoot, path.dirname(target)).replaceAll('\\', '/');
  if (!relative || relative === '.') return;
  const parts = normalizeRelativePath(relative).split('/');
  let current = projectRoot;
  for (const part of parts) {
    const next = path.join(current, part);
    try { await fs.mkdir(next); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = await fs.lstat(next);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('FILESYSTEM_ESCAPE: unsafe project parent.');
    const real = await fs.realpath(next);
    if (real !== next && (process.platform !== 'win32' || real.toLowerCase() !== next.toLowerCase())) {
      throw new Error('FILESYSTEM_ESCAPE: project parent changed during mutation.');
    }
    current = next;
  }
}

async function writeAtomicFile(projectRoot: string, target: string, content: Buffer, mode = 0o644, expectedHash: string | null = null): Promise<string[]> {
  await ensureSafeParent(projectRoot, target);
  await assertNoSymlinkPath(projectRoot, path.relative(projectRoot, target), true);
  const temp = `${target}.vqb-new-${process.pid}-${crypto.randomUUID()}`;
  const displaced = `${target}.vqb-old-${process.pid}-${crypto.randomUUID()}`;
  const warnings: string[] = [];
  await fs.writeFile(temp, content, { mode, flag: 'wx' });
  try {
    await ensureSafeParent(projectRoot, target);
    if (!await exists(target)) {
      if (expectedHash) throw new Error('CONCURRENT_MODIFICATION: replacement target disappeared.');
      await fs.link(temp, target); // Atomic, exclusive creation on the same filesystem.
      try { await fs.rm(temp, { force: true, maxRetries: 8, retryDelay: 100 }); }
      catch { warnings.push(`Не удалось удалить временную new-копию: ${path.basename(temp)}.`); }
      if (sha256(await fs.readFile(target)) !== sha256(content)) throw new Error('POST_WRITE_VERIFY_FAILED: created file changed.');
      return warnings;
    }
    if (!expectedHash || sha256(await fs.readFile(target)) !== expectedHash) {
      throw new Error('CONCURRENT_MODIFICATION: target changed before commit.');
    }
    await fs.rename(target, displaced);
    let committed = false;
    try {
      if (sha256(await fs.readFile(displaced)) !== expectedHash) {
        throw new Error('CONCURRENT_MODIFICATION: displaced bytes differ from verified source.');
      }
      await ensureSafeParent(projectRoot, target);
      if (await exists(target)) throw new Error('CONCURRENT_MODIFICATION: target appeared during replacement.');
      await fs.link(temp, target);
      committed = true;
      if (sha256(await fs.readFile(target)) !== sha256(content)) throw new Error('POST_WRITE_VERIFY_FAILED: replacement changed.');
    } catch (error) {
      const currentHash = await exists(target) ? sha256(await fs.readFile(target)) : null;
      if (currentHash !== null && (!committed || currentHash !== sha256(content))) {
        throw new Error(`ATOMIC_RESTORE_FAILED: target changed concurrently; displaced file preserved at ${path.basename(displaced)}; ${error instanceof Error ? error.message : 'unknown error'}`);
      }
      if (currentHash !== null) await fs.rm(target, { force: true });
      await fs.rename(displaced, target);
      throw error;
    }
    try { await fs.rm(displaced, { force: true, maxRetries: 8, retryDelay: 100 }); }
    catch { warnings.push(`Не удалось удалить временную old-копию после подтверждённой записи: ${path.basename(displaced)}.`); }
    return warnings;
  } finally {
    await fs.rm(temp, { force: true, maxRetries: 3, retryDelay: 50 }).catch(() => undefined);
  }
}

function backupIdFor(fixId: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${stamp}_${fixId}_${crypto.randomBytes(6).toString('hex')}`;
}

async function createBackupDirectory(rootDir: string, fixId: string): Promise<{ backupId: string; backupDir: string }> {
  const backupsRoot = path.join(rootDir, 'fix-backups');
  await fs.mkdir(backupsRoot, { recursive: true });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const backupId = backupIdFor(fixId);
    const backupDir = path.join(backupsRoot, backupId);
    try { await fs.mkdir(backupDir, { recursive: false }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw error;
    }
    try {
      await fs.mkdir(path.join(backupDir, 'files'), { recursive: false });
      return { backupId, backupDir };
    } catch (error) {
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  }
  throw new Error('BACKUP_ID_COLLISION: не удалось безопасно создать уникальный backup directory. Ничего не применено.');
}

async function writeBackupManifest(rootDir: string, dir: string, manifest: BackupManifest): Promise<void> {
  const content = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  const digest = sha256(content);
  const seal = await signWorkspaceSnapshot(rootDir, dir, digest);
  await fs.writeFile(path.join(dir, 'backup-manifest.json'), content);
  await fs.writeFile(path.join(dir, 'backup-manifest.sha256'), `${digest}  backup-manifest.json\n${seal}  installation-seal\n`, 'utf8');
}

async function readBackupManifest(rootDir: string, backupId: string): Promise<{ dir: string; manifest: BackupManifest }> {
  if (!BACKUP_ID_RE.test(backupId)) throw new Error('Invalid backup identifier.');
  const dir = path.join(rootDir, 'fix-backups', backupId);
  const content = await fs.readFile(path.join(dir, 'backup-manifest.json'));
  const sidecar = (await fs.readFile(path.join(dir, 'backup-manifest.sha256'), 'utf8')).trim();
  const lines = sidecar.split(/\r?\n/);
  const expected = lines[0]?.split(/\s+/)[0] ?? '';
  if (!SHA256_RE.test(expected) || sha256(content) !== expected) throw new Error('BACKUP_CORRUPT: backup manifest integrity check failed.');
  const seal = lines[1]?.split(/\s+/)[0] ?? '';
  const authenticated = await signWorkspaceSnapshot(rootDir, dir, expected);
  if (!SHA256_RE.test(seal) || !crypto.timingSafeEqual(Buffer.from(seal, 'hex'), Buffer.from(authenticated, 'hex'))) {
    throw new Error('BACKUP_CORRUPT: backup manifest installation seal missing or invalid.');
  }
  const raw = JSON.parse(content.toString('utf8')) as unknown;
  return { dir, manifest: parseBackupManifest(raw, backupId) };
}

async function missingParentDirs(projectRoot: string, relative: string): Promise<string[]> {
  const parts = normalizeRelativePath(relative).split('/').slice(0, -1);
  const missing: string[] = [];
  let current = projectRoot;
  const relativeParts: string[] = [];
  for (const part of parts) {
    current = path.join(current, part);
    relativeParts.push(part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe parent path: ${relative}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missing.push(relativeParts.join('/'));
    }
  }
  return missing;
}

async function removeCreatedDirs(projectRoot: string, createdDirs: string[] | undefined): Promise<void> {
  for (const relative of [...(createdDirs ?? [])].reverse()) {
    const directory = absoluteInside(projectRoot, relative);
    try { await fs.rmdir(directory); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') throw error;
    }
  }
}

async function removeCreatedFile(projectRoot: string, target: string, expectedHash: string): Promise<void> {
  await ensureSafeParent(projectRoot, target);
  await assertNoSymlinkPath(projectRoot, path.relative(projectRoot, target), false);
  const displaced = `${target}.vqb-removing-${process.pid}-${crypto.randomUUID()}`;
  if (sha256(await fs.readFile(target)) !== expectedHash) throw new Error('CONCURRENT_MODIFICATION: created file changed before rollback.');
  await fs.rename(target, displaced);
  try {
    if (sha256(await fs.readFile(displaced)) !== expectedHash) throw new Error('CONCURRENT_MODIFICATION: created file changed during rollback.');
    await fs.rm(displaced, { force: true, maxRetries: 5, retryDelay: 50 });
  } catch (error) {
    if (!await exists(target)) {
      try { await fs.rename(displaced, target); }
      catch { throw new Error('ROLLBACK_INCOMPLETE: displaced created file could not be restored.'); }
    }
    throw error;
  }
}

async function verifyBackupPayload(dir: string, operation: BackupManifest['operations'][number]): Promise<Buffer> {
  if (operation.action !== 'replace' || !operation.backupEntry || !operation.originalSha256) throw new Error(`Backup metadata incomplete for ${operation.path}.`);
  await assertNoSymlinkPath(dir, operation.backupEntry, false);
  const content = await fs.readFile(absoluteInside(dir, operation.backupEntry));
  if (sha256(content) !== operation.originalSha256) throw new Error(`BACKUP_CORRUPT: ${operation.path} original payload hash mismatch.`);
  return content;
}

async function emergencyRestore(projectRoot: string, backupDir: string, manifest: BackupManifest, attemptedIds: ReadonlySet<string>): Promise<string[]> {
  const failures: string[] = [];
  for (const operation of [...manifest.operations].reverse().filter((item) => attemptedIds.has(item.id))) {
    const target = absoluteInside(projectRoot, operation.path);
    try {
      await assertNoSymlinkPath(projectRoot, operation.path, operation.action === 'create');
      if (operation.action === 'create') {
        if (await exists(target)) {
          const currentHash = sha256(await fs.readFile(target));
          if (currentHash !== operation.afterSha256) throw new Error('concurrent modification prevents safe removal');
          await removeCreatedFile(projectRoot, target, operation.afterSha256);
        }
        await removeCreatedDirs(projectRoot, operation.createdDirs);
      } else {
        const original = await verifyBackupPayload(backupDir, operation);
        const currentHash = await exists(target) ? sha256(await fs.readFile(target)) : '';
        if (currentHash && currentHash !== operation.afterSha256 && currentHash !== operation.originalSha256) {
          throw new Error('concurrent modification prevents safe restore');
        }
        if (currentHash !== operation.originalSha256) await writeAtomicFile(projectRoot, target, original, operation.originalMode ?? 0o644, currentHash || null);
        if (sha256(await fs.readFile(target)) !== operation.originalSha256) throw new Error('restored hash mismatch');
      }
    } catch (error) {
      failures.push(`${operation.path}: ${error instanceof Error ? error.message : 'restore failed'}`);
    }
  }
  return failures;
}

export async function listFixBackups(rootDir: string, projectRootInput: string): Promise<FixBackupList> {
  const projectRoot = await resolveProjectRoot(projectRootInput);
  const projectRootHash = sha256(projectRoot);
  const backupsRoot = path.join(rootDir, 'fix-backups');
  const backups: FixBackupSummary[] = [];
  const warnings: string[] = [];
  let entries: import('node:fs').Dirent[] = [];
  try { entries = await fs.readdir(backupsRoot, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { backups, warnings };
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !BACKUP_ID_RE.test(entry.name)) continue;
    try {
      const { manifest } = await readBackupManifest(rootDir, entry.name);
      if (manifest.projectRootHash !== projectRootHash) continue;
      backups.push({
        backupId: manifest.backupId,
        fixId: manifest.fixId,
        createdAt: manifest.createdAt,
        ...(manifest.rolledBackAt === undefined ? {} : { rolledBackAt: manifest.rolledBackAt }),
        fileCount: manifest.operations.length,
      });
    } catch (error) {
      warnings.push(`${entry.name}: ${error instanceof Error ? error.message : 'backup unreadable'}`);
    }
  }
  backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { backups, warnings };
}

export async function applyFixPackage(rootDir: string, projectRootInput: string, zipBuffer: Buffer): Promise<AppliedFixResult> {
  const projectRoot = await resolveProjectRoot(projectRootInput);
  return withProjectMutationLock(projectRoot, () => applyFixPackageLocked(rootDir, projectRoot, zipBuffer));
}

async function applyFixPackageLocked(rootDir: string, projectRoot: string, zipBuffer: Buffer): Promise<AppliedFixResult> {
  const entries = readZipEntries(zipBuffer);
  const manifestBuffer = entries.get('fix-manifest.json');
  if (!manifestBuffer) throw new Error('fix-manifest.json отсутствует в пакете.');
  let manifest: FixManifest;
  try { manifest = parseFixManifest(JSON.parse(manifestBuffer.toString('utf8'))); }
  catch (error) { throw new Error(`Некорректный fix-manifest.json: ${error instanceof Error ? error.message : 'validation failed'}`); }

  const currentSnapshot = await collectWorkspace(projectRoot);
  if (currentSnapshot.fingerprint !== manifest.sourcePackFingerprint) throw new Error('STALE_WORKSPACE: fingerprint проекта не совпадает с Fix Pack. Ничего не применено.');
  const expectedBinding = await signWorkspaceSnapshot(rootDir, projectRoot, currentSnapshot.fingerprint);
  if (!crypto.timingSafeEqual(Buffer.from(expectedBinding, 'hex'), Buffer.from(manifest.sourcePackBinding, 'hex'))) {
    throw new Error('SOURCE_PROJECT_MISMATCH: Fix Pack относится к другой папке проекта или установке. Ничего не применено.');
  }
  const snapshotKey = (value: string): string => process.platform === 'win32' ? value.toLowerCase() : value;
  const exportedFiles = new Map(currentSnapshot.files.map((file) => [snapshotKey(file.path), file]));

  const prepared: PreparedFixItem[] = [];
  for (const operation of manifest.operations) {
    const relative = normalizeRelativePath(operation.path);
    if (isSensitivePath(relative)) throw new Error(`Fix package пытается изменить защищённый путь: ${relative}`);
    await assertNoSymlinkPath(projectRoot, relative, operation.action === 'create');
    const target = absoluteInside(projectRoot, relative);
    const content = entries.get(operation.archiveEntry);
    if (!content) throw new Error(`В ZIP отсутствует ${operation.archiveEntry}.`);
    if (sha256(content) !== operation.afterSha256) throw new Error(`afterSha256 не совпадает для ${relative}.`);
    if (isSupportedSource(relative, content.length) !== 'YES' || !isTextSource(content)) {
      throw new Error(`${operation.action === 'create' ? 'CREATE_NOT_ALLOWED' : 'REPLACE_NOT_ALLOWED'}: неподдерживаемый, бинарный или слишком большой source-файл: ${relative}.`);
    }
    if (operation.action === 'replace') {
      const exported = exportedFiles.get(snapshotKey(relative));
      if (!exported) throw new Error(`TARGET_NOT_EXPORTED: replace разрешён только для файлов из workspace-manifest: ${relative}.`);
      if (exported.sha256 !== operation.beforeSha256) throw new Error(`SOURCE_MANIFEST_MISMATCH: beforeSha256 не совпадает с экспортированным snapshot для ${relative}.`);
      let current: Buffer;
      try { current = await fs.readFile(target); } catch { throw new Error(`Файл для replace не найден: ${relative}.`); }
      if (sha256(current) !== operation.beforeSha256) throw new Error(`STALE_SOURCE: ${relative} изменился после создания Fix Pack. Ничего не применено.`);
      const stat = await fs.lstat(target);
      if (!stat.isFile()) throw new Error(`Target is not a regular file: ${relative}.`);
      prepared.push({ operation, relative, target, content, originalMode: stat.mode & 0o777, createdDirs: [] });
    } else {
      if (isSupportedSource(relative, content.length) !== 'YES') throw new Error(`CREATE_NOT_ALLOWED: неподдерживаемый или слишком большой source-файл: ${relative}.`);
      if (await exists(target)) throw new Error(`create отказан: файл уже существует: ${relative}.`);
      prepared.push({ operation, relative, target, content, createdDirs: await missingParentDirs(projectRoot, relative) });
    }
  }

  const verification = await verifyPreparedFixSafely(prepared);
  if (verification.status === 'FAILED') {
    const failed = verification.commands.filter((command) => command.status === 'FAILED' || command.status === 'TIMEOUT').map((command) => `${command.script}:${command.status}`).join(', ');
    throw new Error(`PRECHECK_FAILED: non-executing precheck failed${failed ? ` (${failed})` : ''}. Проект не изменён.`);
  }

  const { backupId, backupDir } = await createBackupDirectory(rootDir, manifest.fixId);
  const backupManifest: BackupManifest = {
    schemaVersion: 2,
    backupId,
    fixId: manifest.fixId,
    projectRootHash: sha256(projectRoot),
    createdAt: new Date().toISOString(),
    operations: [],
  };
  for (const item of prepared) {
    if (item.operation.action === 'replace') {
      const backupEntry = `files/${item.operation.id}.bin`;
      const original = await fs.readFile(item.target);
      const originalSha256 = sha256(original);
      if (originalSha256 !== item.operation.beforeSha256) throw new Error(`STALE_SOURCE: ${item.relative} изменился перед созданием backup. Ничего не применено.`);
      const backupPath = path.join(backupDir, backupEntry);
      await fs.writeFile(backupPath, original);
      if (sha256(await fs.readFile(backupPath)) !== originalSha256) throw new Error(`Не удалось подтвердить backup для ${item.relative}. Ничего не применено.`);
      backupManifest.operations.push({
        id: item.operation.id, action: 'replace', path: item.relative, afterSha256: item.operation.afterSha256,
        backupEntry, originalSha256, ...(item.originalMode === undefined ? {} : { originalMode: item.originalMode }),
      });
    } else {
      backupManifest.operations.push({
        id: item.operation.id, action: 'create', path: item.relative, afterSha256: item.operation.afterSha256,
        ...(item.createdDirs.length ? { createdDirs: item.createdDirs } : {}),
      });
    }
  }
  await writeBackupManifest(rootDir, backupDir, backupManifest);

  const warnings: string[] = [];
  const attemptedIds = new Set<string>();
  try {
    for (const item of prepared) {
      await assertNoSymlinkPath(projectRoot, item.relative, item.operation.action === 'create');
      if (item.operation.action === 'replace') {
        const current = await fs.readFile(item.target);
        if (sha256(current) !== item.operation.beforeSha256) throw new Error(`STALE_SOURCE: ${item.relative} changed immediately before write.`);
      } else if (await exists(item.target)) {
        throw new Error(`create refused: file appeared before write: ${item.relative}.`);
      }
      attemptedIds.add(item.operation.id);
      warnings.push(...await writeAtomicFile(projectRoot, item.target, item.content, item.originalMode ?? 0o644,
        item.operation.action === 'replace' ? item.operation.beforeSha256! : null));
      if (sha256(await fs.readFile(item.target)) !== item.operation.afterSha256) throw new Error(`POST_WRITE_VERIFY_FAILED: ${item.relative}.`);
    }
  } catch (error) {
    const rollbackFailures = await emergencyRestore(projectRoot, backupDir, backupManifest, attemptedIds);
    if (rollbackFailures.length) {
      throw new Error(`EMERGENCY_ROLLBACK_INCOMPLETE: ${error instanceof Error ? error.message : 'unknown apply error'}; restore failures: ${rollbackFailures.join(' | ')}`);
    }
    throw new Error(`Применение остановлено; аварийный rollback подтверждён хэшами: ${error instanceof Error ? error.message : 'unknown apply error'}`);
  }

  return { fixId: manifest.fixId, backupId, appliedFiles: prepared.map((item) => item.relative), verification, warnings };
}

export async function rollbackFix(rootDir: string, projectRootInput: string, backupId: string): Promise<{ backupId: string; restoredFiles: string[]; warnings: string[] }> {
  const projectRoot = await resolveProjectRoot(projectRootInput);
  return withProjectMutationLock(projectRoot, () => rollbackFixLocked(rootDir, projectRoot, backupId));
}

async function rollbackFixLocked(rootDir: string, projectRoot: string, backupId: string): Promise<{ backupId: string; restoredFiles: string[]; warnings: string[] }> {
  const { dir, manifest } = await readBackupManifest(rootDir, backupId);
  if (manifest.rolledBackAt) throw new Error('Этот backup уже был откатан.');
  if (manifest.projectRootHash !== sha256(projectRoot)) throw new Error('Backup относится к другой папке проекта.');

  const originals = new Map<string, Buffer>();
  for (const operation of manifest.operations) {
    if (operation.action === 'replace') originals.set(operation.id, await verifyBackupPayload(dir, operation));
  }

  for (const operation of manifest.operations) {
    const target = absoluteInside(projectRoot, operation.path);
    await assertNoSymlinkPath(projectRoot, operation.path, operation.action === 'create');
    if (operation.action === 'create') {
      if (!await exists(target)) continue;
      if (sha256(await fs.readFile(target)) !== operation.afterSha256) throw new Error(`ROLLBACK_BLOCKED: ${operation.path} изменён после применения fix package.`);
    } else {
      if (!await exists(target)) continue;
      const currentHash = sha256(await fs.readFile(target));
      if (currentHash !== operation.afterSha256 && currentHash !== operation.originalSha256) throw new Error(`ROLLBACK_BLOCKED: ${operation.path} изменён после применения fix package.`);
    }
  }

  const restored: string[] = [];
  const warnings: string[] = [];
  for (const operation of [...manifest.operations].reverse()) {
    const target = absoluteInside(projectRoot, operation.path);
    await assertNoSymlinkPath(projectRoot, operation.path, operation.action === 'create');
    if (operation.action === 'create') {
      if (await exists(target)) await removeCreatedFile(projectRoot, target, operation.afterSha256);
      await removeCreatedDirs(projectRoot, operation.createdDirs);
    } else {
      const original = originals.get(operation.id);
      if (!original || !operation.originalSha256) throw new Error(`BACKUP_CORRUPT: ${operation.path} original payload unavailable.`);
      const currentHash = await exists(target) ? sha256(await fs.readFile(target)) : '';
      if (currentHash !== operation.originalSha256) warnings.push(...await writeAtomicFile(projectRoot, target, original, operation.originalMode ?? 0o644, currentHash || null));
      if (sha256(await fs.readFile(target)) !== operation.originalSha256) throw new Error(`ROLLBACK_VERIFY_FAILED: ${operation.path}.`);
    }
    restored.push(operation.path);
  }

  for (const operation of manifest.operations) {
    const target = absoluteInside(projectRoot, operation.path);
    if (operation.action === 'create') {
      if (await exists(target)) throw new Error(`ROLLBACK_VERIFY_FAILED: created file still exists: ${operation.path}.`);
    } else if (!operation.originalSha256 || !await exists(target) || sha256(await fs.readFile(target)) !== operation.originalSha256) {
      throw new Error(`ROLLBACK_VERIFY_FAILED: original hash not restored: ${operation.path}.`);
    }
  }

  manifest.rolledBackAt = new Date().toISOString();
  await writeBackupManifest(rootDir, dir, manifest);
  return { backupId, restoredFiles: restored.reverse(), warnings };
}
