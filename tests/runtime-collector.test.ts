import { describe, expect, it } from 'vitest';
import { recordNetwork, type RuntimeCollector } from '../audit-engine/runtime/collector';

function collector(): RuntimeCollector {
  return {
    console: [], pageErrors: [], network: [],
    limits: { consoleDropped: 0, pageErrorsDropped: 0, networkDropped: 0, textTruncated: 0 },
    markPolicyBlock() {},
  };
}

describe('runtime evidence bounds', () => {
  it('bounds pathological network strings and records evidence truncation', () => {
    const runtime = collector();
    recordNetwork(runtime, {
      kind: 'request-failed', method: 'GET',
      url: `https://example.com/${'u'.repeat(10_000)}`,
      frameUrl: `https://example.com/${'f'.repeat(10_000)}`,
      reason: 'r'.repeat(20_000),
      resourceType: 'x'.repeat(1_000),
    });
    expect(runtime.network).toHaveLength(1);
    expect(runtime.network[0]?.url.length).toBeLessThanOrEqual(4096);
    expect(runtime.network[0]?.frameUrl?.length).toBeLessThanOrEqual(4096);
    expect(runtime.network[0]?.reason?.length).toBeLessThanOrEqual(8192);
    expect(runtime.network[0]?.resourceType?.length).toBeLessThanOrEqual(256);
    expect(runtime.network[0]?.reason).toContain('[TRUNCATED]');
    expect(runtime.limits.textTruncated).toBe(1);
  });
});
