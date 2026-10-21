import path from 'node:path';
import { spawn } from 'node:child_process';

const outputDir = path.resolve(process.argv[2] ?? 'reports/accuracy-benchmark');
const runner = path.resolve('node_modules/vitest/vitest.mjs');
const child = spawn(process.execPath, [runner, 'run', 'tests/accuracy-benchmark.test.ts'], {
  stdio: 'inherit', env: { ...process.env, VQB_BENCHMARK_OUTPUT: outputDir },
});
child.on('error', (error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
