import fs from 'node:fs';
import path from 'node:path';

export const cleanupBuildDirectory = (directory) => fs.rmSync(directory, {
  recursive: true, force: true, maxRetries: 5, retryDelay: 100,
});

// One level at a time, synchronously: avoid the concurrent recursive
// fs.promises.mkdir path that failed in the Windows Rollup writer.
export function ensureDirectory(directory) {
  const absolute = path.resolve(directory);
  const root = path.parse(absolute).root;
  let current = root;
  for (const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      fs.mkdirSync(current);
    } catch (error) {
      if (error.code !== 'EEXIST' || !fs.statSync(current).isDirectory()) throw error;
    }
  }
}

// Preserve the last successful build if the directory swap fails. Staging's
// parent is a unique build-only workspace; it contains no user data.
export function commitDirectory(staging, target) {
  const backup = path.join(path.dirname(staging), 'previous');
  let movedPrevious = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      movedPrevious = true;
    }
    try {
      fs.renameSync(staging, target);
    } catch (error) {
      if (movedPrevious) fs.renameSync(backup, target);
      throw error;
    }
  } catch (error) {
    throw new Error(`Cannot publish frontend build at ${target}: ${error.message}`, { cause: error });
  }
}

function outputPath(fileName) {
  if (typeof fileName !== 'string' || path.win32.isAbsolute(fileName) || path.posix.isAbsolute(fileName)) {
    throw new Error(`Invalid frontend output path: ${fileName}`);
  }
  const parts = fileName.replaceAll('\\', '/').split('/');
  if (parts.some((part) => !part || part === '.' || part === '..' || /[:\0]/.test(part))) {
    throw new Error(`Invalid frontend output path: ${fileName}`);
  }
  return parts;
}

export function writeFrontendOutput(frontendRoot, output) {
  if (!Array.isArray(output) || !output.some((file) => file.fileName === 'index.html' && file.type === 'asset')) {
    throw new Error('Frontend build is incomplete: index.html is missing.');
  }
  const files = output.map((file) => {
    const parts = outputPath(file.fileName);
    const contents = file.type === 'asset' ? file.source : file.type === 'chunk' ? file.code : undefined;
    if (typeof contents !== 'string' && !(contents instanceof Uint8Array)) {
      throw new Error(`Invalid frontend output contents: ${file.fileName}`);
    }
    return { parts, contents };
  });

  const parent = path.resolve(frontendRoot);
  if (!fs.statSync(parent).isDirectory()) throw new Error(`Missing frontend root: ${parent}`);
  const workspace = fs.mkdtempSync(path.join(parent, '.vite-build-stage-'));
  const staging = path.join(workspace, 'next');
  const target = path.join(parent, '.vite-build');
  try {
    ensureDirectory(staging);
    for (const { parts, contents } of files) {
      const destination = path.join(staging, ...parts);
      ensureDirectory(path.dirname(destination));
      fs.writeFileSync(destination, contents);
    }
    commitDirectory(staging, target);
  } finally {
    // Retain the backup if even rollback was blocked by the OS.
    if (!fs.existsSync(path.join(workspace, 'previous')) || fs.existsSync(target)) cleanupBuildDirectory(workspace);
  }
  return target;
}
