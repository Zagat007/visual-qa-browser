import { describe, expect, it } from 'vitest';
import { isAllowedApiOrigin, isAllowedControlPlaneHost, isCrossSiteFetch } from '../app/backend/src/control-plane-policy';

describe('local control-plane policy', () => {
  it('accepts only the expected loopback Host values', () => {
    expect(isAllowedControlPlaneHost('127.0.0.1:4210', 4210)).toBe(true);
    expect(isAllowedControlPlaneHost('localhost:4210', 4210)).toBe(true);
    expect(isAllowedControlPlaneHost('evil.example:4210', 4210)).toBe(false);
    expect(isAllowedControlPlaneHost(undefined, 4210)).toBe(false);
  });

  it('rejects foreign and malformed browser origins while allowing non-browser clients without Origin', () => {
    expect(isAllowedApiOrigin('http://127.0.0.1:4210', 4210)).toBe(true);
    expect(isAllowedApiOrigin('http://localhost:4210', 4210)).toBe(true);
    expect(isAllowedApiOrigin('https://evil.example', 4210)).toBe(false);
    expect(isAllowedApiOrigin('null', 4210)).toBe(false);
    expect(isAllowedApiOrigin(undefined, 4210)).toBe(true);
  });

  it('rejects explicit cross-site Fetch Metadata', () => {
    expect(isCrossSiteFetch('cross-site')).toBe(true);
    expect(isCrossSiteFetch('same-origin')).toBe(false);
    expect(isCrossSiteFetch(undefined)).toBe(false);
  });
});
