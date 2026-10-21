import { describe, expect, it } from 'vitest';
import { evaluateBrowserRequest, isPotentiallyDestructiveGetUrl, isPrivateIp, parseAuditUrl } from '../audit-engine/security/url-policy';
import { redactUrl } from '../audit-engine/privacy/redaction';

describe('URL policy', () => {
  it('accepts public HTTP(S) syntax', () => {
    expect(parseAuditUrl('https://example.com/path').hostname).toBe('example.com');
  });

  it('rejects non-HTTP protocols', () => {
    expect(() => parseAuditUrl('file:///etc/passwd')).toThrow(/Only http/);
  });

  it('classifies private, special-use and public IP ranges', () => {
    for (const blocked of [
      '127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254',
      '192.0.2.1', '198.51.100.1', '203.0.113.1',
      '::1', '[::1]', '::7f00:1', '::ffff:127.0.0.1',
      'fec0::1', 'fe80::1', 'ff02::1', '2001:db8::1',
      '2001::1', '2001:20::1', '2002:7f00:1::1', '3fff::1',
    ]) expect(isPrivateIp(blocked)).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('[2606:4700:4700::1111]')).toBe(false);
  });

  it('classifies non-http browser requests without mislabeling them as private network', async () => {
    await expect(evaluateBrowserRequest('file:///tmp/test')).resolves.toMatchObject({ allowed: false, category: 'unsupported-scheme' });
  });

  it('redacts sensitive query and magic-link path values', () => {
    expect(redactUrl('https://example.com/?token=abc&x=1')).toContain('token=%5BREDACTED%5D');
    expect(redactUrl('https://example.com/order/super-secret-token?x=1')).not.toContain('super-secret-token');
    expect(redactUrl('https://example.com/gift/private-code')).not.toContain('private-code');
  });

  it('does not treat potentially destructive GET actions as safe', () => {
    expect(isPotentiallyDestructiveGetUrl('https://example.com/logout')).toBe(true);
    expect(isPotentiallyDestructiveGetUrl('https://example.com/logout.php')).toBe(true);
    expect(isPotentiallyDestructiveGetUrl('https://example.com/delete-account')).toBe(true);
    expect(isPotentiallyDestructiveGetUrl('https://example.com/account?action=delete')).toBe(true);
    expect(isPotentiallyDestructiveGetUrl('https://example.com/account?action=cancel-order')).toBe(true);
    expect(isPotentiallyDestructiveGetUrl('https://example.com/blog/how-to-delete-account')).toBe(false);
    expect(isPotentiallyDestructiveGetUrl('https://example.com/payment-history')).toBe(false);
    expect(isPotentiallyDestructiveGetUrl('https://example.com/order/private-token')).toBe(false);
  });
});
