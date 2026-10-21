import fs from 'node:fs';
import path from 'node:path';
import { cleanupBuildDirectory, commitDirectory, ensureDirectory } from './frontend-build-files.mjs';

const root = process.cwd();
const source = path.resolve(root, 'app/frontend/.vite-build');
const distRoot = path.resolve(root, 'dist');
const target = path.join(distRoot, 'frontend');
if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  throw new Error(`Frontend build output is missing: ${source}`);
}

if (!fs.existsSync(path.join(source, 'index.html')) || !fs.statSync(path.join(source, 'index.html')).isFile()) {
  throw new Error('Frontend build is incomplete: index.html is missing.');
}

ensureDirectory(distRoot);
const workspace = fs.mkdtempSync(path.join(distRoot, '.frontend-stage-'));
const staging = path.join(workspace, 'next');
try {
  fs.cpSync(source, staging, { recursive: true, force: false, errorOnExist: true });
  const guideCandidates = [
    path.join(root, 'docs', 'FUNCTIONS_RU.txt'),
    path.join(root, 'app', 'frontend', 'public', 'FUNCTIONS_RU.txt'),
  ];
  const guide = guideCandidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (guide) fs.copyFileSync(guide, path.join(staging, 'FUNCTIONS_RU.txt'));
  commitDirectory(staging, target);
} finally {
  if (!fs.existsSync(path.join(workspace, 'previous')) || fs.existsSync(target)) cleanupBuildDirectory(workspace);
}

console.log(`Published frontend build: ${target}`);
