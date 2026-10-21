import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };
const viteConfig = fs.readFileSync('app/frontend/vite.config.ts', 'utf8');
const writerUrl = pathToFileURL(path.resolve('scripts/frontend-build-files.mjs')).href;
const builderUrl = pathToFileURL(path.resolve('scripts/build-frontend.mjs')).href;
const publisher = path.resolve('scripts/publish-frontend-build.mjs');
const roots: string[] = [];
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vqb-build-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'app/frontend'), { recursive: true });
  return root;
};
const runNode = (root: string, code: string) => execFileSync(process.execPath, ['--input-type=module', '-e', code], {
  cwd: root, encoding: 'utf8', stdio: 'pipe', timeout: 15000,
});
const writeOutput = (root: string, output: unknown) => runNode(root, `
  import { writeFrontendOutput } from ${JSON.stringify(writerUrl)};
  writeFrontendOutput('app/frontend', ${JSON.stringify(output)});
`);
const index = { type: 'asset', fileName: 'index.html', source: '<!doctype html><title>qa</title>' };
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('build output pipeline', () => {
  it('generates in memory, writes sequentially, then publishes and bundles the backend', () => {
    expect(pkg.scripts?.['build:frontend']).toBe('node scripts/build-frontend.mjs');
    expect(pkg.scripts?.['build:publish-frontend']).toBe('node scripts/publish-frontend-build.mjs');
    expect(pkg.scripts?.['build:server']).toContain('tsup app/backend/src/index.ts');
    expect(pkg.scripts?.['build:server']).toContain('app/backend/src/lighthouse-worker-entry.ts');
    expect(pkg.scripts?.build).toBe('npm run build:frontend && npm run build:publish-frontend && npm run build:server');
    expect(viteConfig).toContain("'.vite-build'");
    expect(viteConfig).toContain('write: false');
    expect(viteConfig).toContain('emptyOutDir: false');
  });

  it('publishes a completed frontend build without relying on Rollup writing to external dist', () => {
    const root = fixture();
    const source = path.join(root, 'app/frontend/.vite-build');
    const target = path.join(root, 'dist/frontend');
    fs.mkdirSync(path.join(source, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(source, 'index.html'), '<!doctype html><title>qa</title>');
    fs.writeFileSync(path.join(source, 'assets', 'app.js'), 'console.log("ok")');
    fs.writeFileSync(path.join(root, 'docs', 'FUNCTIONS_RU.txt'), 'Russian guide');

    execFileSync(process.execPath, [path.resolve('scripts/publish-frontend-build.mjs')], { cwd: root, stdio: 'pipe' });

    expect(fs.existsSync(path.join(target, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(target, 'assets', 'app.js'))).toBe(true);
    expect(fs.readFileSync(path.join(target, 'FUNCTIONS_RU.txt'), 'utf8')).toBe('Russian guide');
  });

  it('writes nested chunks and binary assets and removes stale files on the next build', () => {
    const root = fixture();
    runNode(root, `
      import { writeFrontendOutput } from ${JSON.stringify(writerUrl)};
      writeFrontendOutput('app/frontend', [${JSON.stringify(index)},
        {type:'chunk', fileName:'assets/nested/app.js', code:'console.log("ok")'},
        {type:'asset', fileName:'assets/image.bin', source:new Uint8Array([0,128,255])}]);
    `);
    const output = path.join(root, 'app/frontend/.vite-build');
    expect(fs.readFileSync(path.join(output, 'assets/nested/app.js'), 'utf8')).toBe('console.log("ok")');
    expect([...fs.readFileSync(path.join(output, 'assets/image.bin'))]).toEqual([0, 128, 255]);
    writeOutput(root, [index]);
    expect(fs.readdirSync(output)).toEqual(['index.html']);
    expect(fs.readdirSync(path.dirname(output)).filter((name) => name.startsWith('.vite-build-stage-'))).toEqual([]);
  });

  it('preserves the previous build and cleans staging if writing the new bundle fails', () => {
    const root = fixture();
    writeOutput(root, [index]);
    expect(() => writeOutput(root, [index,
      { type: 'asset', fileName: 'assets', source: 'conflict' },
      { type: 'chunk', fileName: 'assets/app.js', code: 'new build' },
    ])).toThrow();
    expect(fs.readFileSync(path.join(root, 'app/frontend/.vite-build/index.html'), 'utf8')).toBe(index.source);
    expect(fs.readdirSync(path.join(root, 'app/frontend')).filter((name) => name.startsWith('.vite-build-stage-'))).toEqual([]);
  });

  it('rejects incomplete bundles and paths escaping the output directory', () => {
    const root = fixture();
    writeOutput(root, [index]);
    expect(() => writeOutput(root, [])).toThrow(/index.html is missing/);
    for (const fileName of ['../escaped.js', '/absolute.js', 'C:\\outside.js', 'assets/../../escaped.js']) {
      expect(() => writeOutput(root, [index, { type: 'asset', fileName, source: 'bad' }])).toThrow(/Invalid frontend output path/);
    }
    expect(fs.readFileSync(path.join(root, 'app/frontend/.vite-build/index.html'), 'utf8')).toBe(index.source);
    expect(fs.existsSync(path.join(root, 'app/escaped.js'))).toBe(false);
  });

  it('rolls back to the previous build if the final directory rename is blocked', () => {
    const root = fixture();
    writeOutput(root, [index]);
    const log = runNode(root, `
      import fs from 'node:fs';
      import path from 'node:path';
      import { writeFrontendOutput } from ${JSON.stringify(writerUrl)};
      const original = fs.renameSync;
      fs.renameSync = (source, target) => {
        if (path.basename(String(source)) === 'next') {
          throw Object.assign(new Error('injected Windows sharing violation'), {code:'EPERM'});
        }
        return original(source, target);
      };
      try {
        writeFrontendOutput('app/frontend', [{type:'asset',fileName:'index.html',source:'new build'}]);
        process.exitCode = 1;
      } catch (error) {
        console.log(error.message);
      }
    `);
    expect(log).toContain('injected Windows sharing violation');
    expect(fs.readFileSync(path.join(root, 'app/frontend/.vite-build/index.html'), 'utf8')).toBe(index.source);
    expect(fs.readdirSync(path.join(root, 'app/frontend')).filter((name) => name.startsWith('.vite-build-stage-'))).toEqual([]);
  });

  it('does not replace a working published build with an incomplete frontend', () => {
    const root = fixture();
    writeOutput(root, [index]);
    execFileSync(process.execPath, [publisher], { cwd: root, stdio: 'pipe' });
    fs.unlinkSync(path.join(root, 'app/frontend/.vite-build/index.html'));
    expect(() => execFileSync(process.execPath, [publisher], { cwd: root, stdio: 'pipe' })).toThrow();
    expect(fs.readFileSync(path.join(root, 'dist/frontend/index.html'), 'utf8')).toBe(index.source);
  });

  it('builds real HTML/JS/CSS with ENOENT injected into the former Rollup directory writer', () => {
    const root = fixture();
    const frontend = path.join(root, 'app/frontend');
    fs.mkdirSync(path.join(frontend, 'src'));
    fs.writeFileSync(path.join(frontend, 'vite.config.ts'), 'export default { root: import.meta.dirname };');
    fs.writeFileSync(path.join(frontend, 'index.html'), '<!doctype html><div id="app"></div><script type="module" src="/src/main.js"></script>');
    fs.writeFileSync(path.join(frontend, 'src/main.js'), 'import "./style.css"; document.getElementById("app").textContent="real compiled bundle";');
    fs.writeFileSync(path.join(frontend, 'src/style.css'), '#app { color: red; }');
    const fault = `
      import fsp from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const original = fsp.mkdir;
      fsp.mkdir = async (directory, ...args) => {
        if (String(directory).includes('.vite-build')) {
          throw Object.assign(new Error('injected Windows mkdir ENOENT'), {code:'ENOENT'});
        }
        return original(directory, ...args);
      };
      syncBuiltinESMExports();
    `;
    const viteUrl = pathToFileURL(path.resolve('node_modules/vite/dist/node/index.js')).href;
    expect(() => runNode(root, `${fault}
      const { build } = await import(${JSON.stringify(viteUrl)});
      await build({configFile:'app/frontend/vite.config.ts', build:{outDir:'.vite-build',write:true}});
    `)).toThrow(/injected Windows mkdir ENOENT/);
    const log = runNode(root, `${fault} await import(${JSON.stringify(builderUrl)});`);
    expect(log).toContain('Frontend files written sequentially:');
    const output = path.join(frontend, '.vite-build');
    const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
    const assets = fs.readdirSync(path.join(output, 'assets'));
    const js = assets.find((name) => name.endsWith('.js'));
    const css = assets.find((name) => name.endsWith('.css'));
    expect(js).toBeDefined();
    expect(css).toBeDefined();
    expect(html).toContain(`/assets/${js}`);
    expect(html).toContain(`/assets/${css}`);
    expect(fs.readFileSync(path.join(output, 'assets', js!), 'utf8')).toContain('real compiled bundle');
  }, 20000);
});
