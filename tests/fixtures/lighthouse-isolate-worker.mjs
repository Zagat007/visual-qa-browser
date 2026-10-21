import fs from 'node:fs';
import path from 'node:path';

const send = (message) => {
  if (process.connected && process.send) process.send(message);
};

process.on('message', (message) => {
  if (message?.type === 'cancel') process.exit(0);
  if (message?.type !== 'start') return;
  if (String(message.options?.url ?? '').includes('/hang')) {
    // Record the exact owned PID so the regression can prove the hard-wedged
    // isolate is actually reaped, not merely abandoned after parent rejection.
    fs.writeFileSync(path.join(String(message.options?.outputDir ?? '.'), 'fixture-worker.pid'), String(process.pid));
    // Deliberately wedge only this child event loop. The parent control plane
    // must still be able to cancel and hard-kill us.
    while (true) { /* intentional fixture */ }
  }
  send({ type: 'progress', progress: { run: 1, totalRuns: 3, phase: 'measure', elapsedMs: 10, timeoutMs: 120000 } });
  send({ type: 'run-complete', completedRuns: 1, totalRuns: 3 });
  send({ type: 'result', evidence: {
    auditStatus: 'FAILED', labMeasurement: true, methodology: 'TEST_ISOLATE', profile: {},
    requestedRuns: 3, completedRuns: 0, validRuns: 0, validForVerdict: false,
    measurementSanity: { status: 'SUSPECT', suspectRuns: [], reasons: ['fixture'] },
    nodeVersion: process.versions.node, targetUrl: 'https://example.com/',
    median: { performanceScore: null, lcpMs: null, cls: null, fcpMs: null, ttfbMs: null, speedIndexMs: null, totalBlockingTimeMs: null },
    medianResources: { requestCount: null, transferBytes: null }, runs: [], limitations: ['fixture'],
  } });
});

send({ type: 'ready' });
