import { describe, expect, it } from 'vitest';
import { containsLikelyPii, hasSensitivePathMarker, redactPiiText, redactText, redactTextForExternalEvidence, redactUrl, redactUrlForExternalEvidence, sanitizeExternalJson } from '../audit-engine/privacy/redaction';

describe('evidence redaction', () => {
  it('redacts secret query parameters and magic-link path segments', () => {
    const value = redactUrl('https://example.com/order/private-magic-token?token=query-secret&safe=value');
    expect(value).not.toContain('private-magic-token');
    expect(value).not.toContain('query-secret');
    expect(value).toContain('safe=value');
    expect(value).toContain('[REDACTED]');
  });

  it('strips all query/hash values and data/blob payloads from external AI URL evidence', () => {
    const signed = redactUrlForExternalEvidence('https://cdn.example.com/image.jpg?X-Amz-Signature=secret&email=alice@example.com#fragment');
    expect(signed).toBe('https://cdn.example.com/image.jpg');
    expect(redactUrlForExternalEvidence('data:image/png;base64,SECRET')).toBe('[REDACTED_DATA_URL]');
    expect(redactUrlForExternalEvidence('blob:https://example.com/abc')).toBe('[REDACTED_BLOB_URL]');
  });


  it('removes all URL query/hash values from external text evidence', () => {
    const value = redactTextForExternalEvidence('Open https://example.com/path?unknown=secret-value&safe=also-secret#fragment');
    expect(value).toBe('Open https://example.com/path');
  });

  it('redacts secrets embedded inside error text', () => {
    const value = redactText('Navigation failed at https://example.com/gift/recipient-token?session=session-secret bearer abc.def.ghi');
    expect(value).not.toContain('recipient-token');
    expect(value).not.toContain('session-secret');
    expect(value).not.toContain('abc.def.ghi');
  });

  it('redacts complete authorization/cookie header values and private-key blocks', () => {
    const value = redactText('Authorization: Basic dXNlcjpwYXNz\nCookie: session=abc123; theme=dark\nSet-Cookie: auth=secret; HttpOnly\nX-API-Key: top-secret');
    expect(value).not.toContain('dXNlcjpwYXNz');
    expect(value).not.toContain('abc123');
    expect(value).not.toContain('auth=secret');
    expect(value).not.toContain('top-secret');
    const pem = redactTextForExternalEvidence('before -----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY----- after');
    expect(pem).not.toContain('ABCDEF');
    expect(pem).toContain('[REDACTED_PRIVATE_KEY]');
    expect(JSON.stringify(sanitizeExternalJson({ 'x-api-key': 'header-secret' }))).not.toContain('header-secret');
  });
  it('detects high-confidence public PII and provides text-only external-AI redaction', () => {
    expect(containsLikelyPii('Contact alice@example.com or +358 40 123 4567')).toBe(true);
    expect(containsLikelyPii('Price 2490 ₽, viewport 390x844, date 2026-10-01')).toBe(false);
    expect(redactPiiText('Email alice@example.com, phone +358 40 123 4567')).toContain('[REDACTED_EMAIL]');
    expect(redactPiiText('Email alice@example.com, phone +358 40 123 4567')).toContain('[REDACTED_PHONE]');
    expect(hasSensitivePathMarker('https://example.com/order/secret-token')).toBe(true);
    expect(hasSensitivePathMarker('https://example.com/pricing')).toBe(false);
  });

});
