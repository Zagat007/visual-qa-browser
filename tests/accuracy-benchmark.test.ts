import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { expect, it } from 'vitest';
import { runAccuracyBenchmark } from '../scripts/benchmark-accuracy';

it('measures labelled detector cases without treating fixture scores as real-site accuracy', async () => {
  const temporary = process.env.VQB_BENCHMARK_OUTPUT ? null : await fs.mkdtemp(path.join(os.tmpdir(), 'vqb-accuracy-'));
  try {
    const result = await runAccuracyBenchmark(process.env.VQB_BENCHMARK_OUTPUT ?? temporary!);
    expect(result).toMatchObject({ caseCount: 35, totals: { fp: 0, fn: 0 } });
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}, 60_000);
