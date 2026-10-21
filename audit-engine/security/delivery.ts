import type { Response } from 'playwright';
import { redactText, redactUrl } from '../privacy/redaction.js';
import type { DeliveryEvidence } from '../shared/types.js';

const HEADER_ALLOWLIST = [
  'strict-transport-security',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-type-options',
  'referrer-policy',
  'permissions-policy',
  'cache-control',
  'content-encoding',
  'content-type',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
] as const;

function trimHeader(value: string): string {
  return redactText(value).slice(0, 4000);
}

export async function collectDeliveryEvidence(response: Response | null, finalUrl: string): Promise<DeliveryEvidence> {
  if (!response) {
    return {
      auditStatus: 'NOT_VERIFIED',
      finalUrl: redactUrl(finalUrl),
      status: null,
      headers: {},
      setCookieCount: 0,
      cookieFlagSummary: { missingSecure: 0, missingHttpOnly: 0, missingSameSite: 0 },
      findings: [{ rule: 'no-main-response', severity: 'P2', message: 'Main navigation response was unavailable; delivery headers are NOT VERIFIED.' }],
    };
  }

  const headers = await response.allHeaders();
  const evidenceHeaders: Record<string, string> = {};
  for (const name of HEADER_ALLOWLIST) {
    const value = headers[name];
    if (value) evidenceHeaders[name] = trimHeader(value);
  }

  let setCookies: string[] = [];
  try {
    setCookies = await response.headerValues('set-cookie');
  } catch {
    const value = headers['set-cookie'];
    if (value) setCookies = [value];
  }
  const cookieFlagSummary = {
    missingSecure: setCookies.filter((value) => !/;\s*secure(?:;|$)/i.test(value)).length,
    missingHttpOnly: setCookies.filter((value) => !/;\s*httponly(?:;|$)/i.test(value)).length,
    missingSameSite: setCookies.filter((value) => !/;\s*samesite=/i.test(value)).length,
  };

  const url = new URL(finalUrl);
  const findings: DeliveryEvidence['findings'] = [];
  if (url.protocol !== 'https:') findings.push({ rule: 'not-https', severity: 'P1', message: 'Final page URL is not HTTPS.' });
  if (url.protocol === 'https:' && !headers['strict-transport-security']) findings.push({ rule: 'missing-hsts', severity: 'P3', message: 'HSTS header is missing on this HTTPS response.' });
  if (!headers['content-security-policy']) findings.push({ rule: 'missing-csp', severity: 'P3', message: 'Content-Security-Policy header is missing.' });
  if ((headers['x-content-type-options'] ?? '').toLowerCase() !== 'nosniff') findings.push({ rule: 'missing-nosniff', severity: 'P3', message: 'X-Content-Type-Options: nosniff is missing.' });
  if (!headers['referrer-policy']) findings.push({ rule: 'missing-referrer-policy', severity: 'P3', message: 'Referrer-Policy header is missing.' });
  if (cookieFlagSummary.missingSecure > 0 && url.protocol === 'https:') findings.push({ rule: 'cookie-missing-secure', severity: 'P2', message: `${cookieFlagSummary.missingSecure} Set-Cookie header(s) lack Secure.` });
  if (cookieFlagSummary.missingHttpOnly > 0) findings.push({ rule: 'cookie-missing-httponly', severity: 'P3', message: `${cookieFlagSummary.missingHttpOnly} Set-Cookie header(s) lack HttpOnly.` });
  if (cookieFlagSummary.missingSameSite > 0) findings.push({ rule: 'cookie-missing-samesite', severity: 'P3', message: `${cookieFlagSummary.missingSameSite} Set-Cookie header(s) lack SameSite.` });

  return {
    auditStatus: findings.length > 0 ? 'ISSUE' : 'PASS',
    finalUrl: redactUrl(finalUrl),
    status: response.status(),
    headers: evidenceHeaders,
    setCookieCount: setCookies.length,
    cookieFlagSummary,
    findings,
  };
}
