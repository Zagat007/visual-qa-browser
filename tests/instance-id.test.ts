import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeInstanceId, normalizedInstanceRoot } from '../app/backend/src/instance-id';

describe('installation instance identity', () => {
  it('is stable for path casing and a trailing separator', () => {
    const root = path.resolve('Example-Install');
    expect(normalizedInstanceRoot(`${root}${path.sep}`)).toBe(normalizedInstanceRoot(root.toUpperCase()));
    expect(computeInstanceId(`${root}${path.sep}`)).toBe(computeInstanceId(root.toUpperCase()));
    expect(computeInstanceId(root)).toMatch(/^[a-f0-9]{24}$/);
  });

  it('changes for a different installation root', () => {
    expect(computeInstanceId(path.resolve('install-a'))).not.toBe(computeInstanceId(path.resolve('install-b')));
  });
});
