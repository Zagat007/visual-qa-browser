import fs from 'node:fs';
import path from 'node:path';

export const PACKAGE_EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'reports',
  'audits',
  'checkpoints',
  'baselines',
  'fix-backups',
]);

export const PACKAGE_DERIVED_FILES = new Set([
  'PACKAGE_PROVENANCE.json',
  'PACKAGE_MANIFEST.sha256',
]);

function isVolatileEntryName(name) {
  return name.endsWith('.log') || name === '.vite-build' || name.startsWith('.vite-build-stage-');
}

/**
 * Returns the deterministic release file set used by package provenance and
 * integrity verification. Paths are POSIX-style and sorted by traversal.
 */
export function listPackageFiles(root, options = {}) {
  const includeProvenance = options.includeProvenance ?? false;
  const includeManifest = options.includeManifest ?? false;
  const absoluteRoot = path.resolve(root);
  const result = [];

  function walk(dir, relativeDir = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!relativeDir && entry.isDirectory() && PACKAGE_EXCLUDED_DIRS.has(entry.name)) continue;
      if (isVolatileEntryName(entry.name)) continue;
      if (!relativeDir && entry.isFile()) {
        if (entry.name === 'PACKAGE_PROVENANCE.json' && !includeProvenance) continue;
        if (entry.name === 'PACKAGE_MANIFEST.sha256' && !includeManifest) continue;
      }

      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else if (entry.isFile()) {
        result.push(relative.replaceAll('\\', '/'));
      } else {
        throw new Error(`Unsupported filesystem entry in package: ${relative}`);
      }
    }
  }

  walk(absoluteRoot);
  return result;
}
