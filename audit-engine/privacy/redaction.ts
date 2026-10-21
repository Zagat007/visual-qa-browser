const SECRET_QUERY_KEYS = /^(token|access_token|auth|authorization|key|api_key|apikey|secret|session|sid|code|password|pass|signature|sig|magic_link|magiclink)$/i;
const SENSITIVE_PATH_MARKERS = new Set([
  'order',
  'buyer',
  'gift',
  'magic',
  'magic-link',
  'invite',
  'reset-password',
  'verify',
  'auth',
  'session',
]);

function redactSensitivePath(url: URL): void {
  const segments = url.pathname.split('/');
  for (let index = 0; index < segments.length - 1; index += 1) {
    const marker = decodeURIComponent(segments[index] ?? '').toLowerCase();
    if (!SENSITIVE_PATH_MARKERS.has(marker)) continue;
    const candidate = segments[index + 1] ?? '';
    if (!candidate || candidate === '[REDACTED]') continue;
    segments[index + 1] = '[REDACTED]';
  }
  url.pathname = segments.join('/');
}


export function hasSensitivePathMarker(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.pathname.split('/').some((segment) => SENSITIVE_PATH_MARKERS.has(decodeURIComponent(segment).toLowerCase()));
  } catch {
    return true;
  }
}

export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_KEYS.test(key)) url.searchParams.set(key, '[REDACTED]');
    }
    redactSensitivePath(url);
    if (url.username) url.username = '[REDACTED]';
    if (url.password) url.password = '[REDACTED]';
    return url.toString();
  } catch {
    return '[INVALID_URL]';
  }
}


/** Conservative URL form for AI/evidence packages: preserve origin/path, remove all query/hash values. */
export function redactUrlForExternalEvidence(raw: string): string {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'data:') return '[REDACTED_DATA_URL]';
    if (url.protocol === 'blob:') return '[REDACTED_BLOB_URL]';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return `[REDACTED_${url.protocol.replace(':', '').toUpperCase()}_URL]`;
    redactSensitivePath(url);
    if (url.username) url.username = '[REDACTED]';
    if (url.password) url.password = '[REDACTED]';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '[INVALID_URL]';
  }
}

function redactEmbeddedUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>()[\]{}]+/gi, (match) => {
    const trailing = match.match(/[.,;:!?]+$/)?.[0] ?? '';
    const candidate = trailing ? match.slice(0, -trailing.length) : match;
    return `${redactUrl(candidate)}${trailing}`;
  });
}

function redactEmbeddedUrlsForExternalEvidence(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>()[\]{}]+/gi, (match) => {
    const trailing = match.match(/[.,;:!?]+$/)?.[0] ?? '';
    const candidate = trailing ? match.slice(0, -trailing.length) : match;
    return `${redactUrlForExternalEvidence(candidate)}${trailing}`;
  });
}

export function redactText(value: string): string {
  return redactEmbeddedUrls(value)
    .replace(/(\/(?:order|buyer|gift|magic|magic-link|invite|reset-password|verify|auth|session)\/)[^/?#\s"'<>]+/gi, '$1[REDACTED]')
    // Header-shaped credentials need whole-value redaction. Redacting only the
    // word `Basic` would leave the base64 credential visible in GPT evidence.
    .replace(/\b((?:authorization|proxy-authorization)\s*[:=]\s*)[^\r\n,;]+/gi, '$1[REDACTED]')
    .replace(/\b((?:cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/(bearer\s+)[a-z0-9._~+\/-]+=*/gi, '$1[REDACTED]')
    .replace(/((?:x[-_]?api[-_]?key|x[-_]?auth[-_]?token|client[_-]?secret|api[_-]?key|token|secret|password|session|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

/** Stronger redaction for artifacts that the user may upload outside the local workstation. */
export function redactTextForExternalEvidence(value: string): string {
  const withoutPrivateKeys = value.replace(/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
  return redactEmbeddedUrlsForExternalEvidence(redactText(withoutPrivateKeys))
    .replace(/([\\]?"(?:authorization|proxy-authorization|x[-_]?api[-_]?key|x[-_]?auth[-_]?token|api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|session|sid|cookie|set-cookie|signature|private[_-]?key|client[_-]?secret)[\\]?"\s*:\s*[\\]?")[^"\\]*(?:\\.[^"\\]*)*([\\]?")/gi, '$1[REDACTED]$2')
    .replace(/([?&][A-Za-z0-9_.~-]+)=([^&#\s"'<>]*)/g, '$1=[REDACTED]');
}

const EXTERNAL_SECRET_KEY = /^(?:authorization|proxy-authorization|x[-_]?api[-_]?key|x[-_]?auth[-_]?token|api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|session|sid|cookie|set-cookie|signature|private[_-]?key|client[_-]?secret)$/i;

/** Sanitize values before JSON serialization; never rewrite serialized JSON syntax. */
export function sanitizeExternalJson(value: unknown, key = ''): unknown {
  if (EXTERNAL_SECRET_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'string') return redactTextForExternalEvidence(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeExternalJson(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, sanitizeExternalJson(child, name)]));
  }
  return value;
}

export function sanitizeExternalArtifact(name: string, content: Buffer): Buffer {
  if (!/\.(?:json|txt|md|html|htm|css|js|ts|xml|yaml|yml|toml|ini|conf|properties)$/i.test(name)) return content;
  const raw = content.toString('utf8');
  if (/\.json$/i.test(name)) {
    try { return Buffer.from(`${JSON.stringify(sanitizeExternalJson(JSON.parse(raw)), null, 2)}\n`); }
    catch { /* A malformed optional artifact is still sanitized as plain text. */ }
  }
  return Buffer.from(redactTextForExternalEvidence(raw));
}

const LIKELY_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const LIKELY_PHONE = /(?:\+\d(?:[\s().-]*\d){7,14}\b|\b(?:\d[\s().-]*){10,15}\b)/;

/** High-confidence public PII signal used as a firewall before external multimodal upload. */
export function containsLikelyPii(value: string): boolean {
  return LIKELY_EMAIL.test(value) || LIKELY_PHONE.test(value);
}

/** Text-only external-AI redaction. Screenshot upload is blocked entirely when a likely PII signal is detected. */
export function redactPiiText(value: string): string {
  return redactText(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/(?:\+\d(?:[\s().-]*\d){7,14}\b|\b(?:\d[\s().-]*){10,15}\b)/g, '[REDACTED_PHONE]');
}
