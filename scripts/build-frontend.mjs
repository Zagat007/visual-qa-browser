import path from 'node:path';
import { build } from 'vite';
import { writeFrontendOutput } from './frontend-build-files.mjs';

const frontendRoot = path.join(process.cwd(), 'app', 'frontend');
// Generate the real bundle in memory. Vite must neither empty the output
// directory nor invoke Rollup's failing asynchronous Windows writer.
const result = await build({
  configFile: path.join(frontendRoot, 'vite.config.ts'),
  build: { write: false, emptyOutDir: false, copyPublicDir: false, watch: null },
});
if (Array.isArray(result) || !Array.isArray(result.output)) {
  throw new Error('Expected a single frontend bundle. Watch/multiple outputs are not supported.');
}
const output = writeFrontendOutput(frontendRoot, result.output);
console.log(`Frontend files written sequentially: ${result.output.length}; ${output}`);
