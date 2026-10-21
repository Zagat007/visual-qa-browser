import dns from 'node:dns/promises';
import net from 'node:net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata',
]);

const POTENTIALLY_DESTRUCTIVE_ACTIONS = [
  'unsubscribe', 'deactivate', 'purchase', 'checkout', 'payment', 'publish', 'confirm',
  'archive', 'destroy', 'approve', 'reject', 'upload', 'cancel', 'delete', 'remove',
  'logout', 'log-out', 'signout', 'sign-out', 'send', 'buy', 'pay',
] as const;
const ACTION_QUERY_KEYS = new Set(['action', 'op', 'operation', 'do', 'intent', 'cmd', 'command']);
const SAFE_ACTION_SUFFIXES = new Set([
  'history', 'status', 'help', 'docs', 'documentation', 'guide', 'info', 'information',
  'page', 'form', 'view', 'preview', 'settings', 'method', 'methods', 'options',
  'success', 'failed', 'failure', 'cancelled', 'canceled',
]);
const EXECUTABLE_SUFFIXES = new Set(['php', 'asp', 'aspx', 'jsp', 'cgi', 'do', 'action']);

function decodedLower(value: string): string {
  try { return decodeURIComponent(value).trim().toLowerCase(); }
  catch { return value.trim().toLowerCase(); }
}

function matchesDestructiveActionToken(value: string): boolean {
  const normalized = decodedLower(value);
  if (!normalized) return false;
  for (const action of POTENTIALLY_DESTRUCTIVE_ACTIONS) {
    if (normalized === action) return true;
    for (const delimiter of ['-', '_', '.', ':', '~']) {
      const prefix = `${action}${delimiter}`;
      if (!normalized.startsWith(prefix)) continue;
      const suffix = normalized.slice(prefix.length);
      const firstSuffixToken = suffix.split(/[-_.:~]/, 1)[0] ?? '';
      if (delimiter === '.' && EXECUTABLE_SUFFIXES.has(firstSuffixToken)) return true;
      if (!SAFE_ACTION_SUFFIXES.has(firstSuffixToken)) return true;
    }
  }
  return false;
}

export function isPotentiallyDestructiveGetUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  const segments = url.pathname.split('/').map(decodedLower).filter(Boolean);
  if (segments.some(matchesDestructiveActionToken)) return true;
  for (const [key, value] of url.searchParams) {
    if (!ACTION_QUERY_KEYS.has(key.toLowerCase())) continue;
    if (matchesDestructiveActionToken(value)) return true;
  }
  return false;
}

export type BrowserRequestDecision =
  | { allowed: true }
  | { allowed: false; category: 'invalid-url' | 'unsupported-scheme' | 'private-network' | 'validation-failed'; reason: string };

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  const [a, b, c, d] = parts as [number, number, number, number];
  return (((a << 24) >>> 0) + (b << 16) + (c << 8) + d) >>> 0;
}

function inIpv4Cidr(ipValue: number, network: string, prefix: number): boolean {
  const networkValue = ipv4ToInt(network);
  if (networkValue === null) return true;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipValue & mask) === (networkValue & mask);
}

const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true;
  return BLOCKED_IPV4_CIDRS.some(([network, prefix]) => inIpv4Cidr(value, network, prefix));
}

function ipv6Bytes(ip: string): Uint8Array | null {
  let value = ip.toLowerCase();
  const zoneIndex = value.indexOf('%');
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);

  if (value.includes('.')) {
    const lastColon = value.lastIndexOf(':');
    if (lastColon < 0) return null;
    const ipv4 = value.slice(lastColon + 1);
    const ipv4Value = ipv4ToInt(ipv4);
    if (ipv4Value === null) return null;
    value = `${value.slice(0, lastColon)}:${((ipv4Value >>> 16) & 0xffff).toString(16)}:${(ipv4Value & 0xffff).toString(16)}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) return null;
  const parseHalf = (part: string): number[] | null => {
    if (!part) return [];
    const words = part.split(':');
    const result: number[] = [];
    for (const word of words) {
      if (!/^[0-9a-f]{1,4}$/.test(word)) return null;
      result.push(Number.parseInt(word, 16));
    }
    return result;
  };
  const left = parseHalf(halves[0] ?? '');
  const right = parseHalf(halves[1] ?? '');
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;
  const words = halves.length === 2 ? [...left, ...Array<number>(missing).fill(0), ...right] : left;
  if (words.length !== 8) return null;
  const bytes = new Uint8Array(16);
  words.forEach((word, index) => {
    bytes[index * 2] = (word >>> 8) & 0xff;
    bytes[index * 2 + 1] = word & 0xff;
  });
  return bytes;
}

function inIpv6Cidr(ip: Uint8Array, network: string, prefix: number): boolean {
  const networkBytes = ipv6Bytes(network);
  if (!networkBytes) return true;
  const fullBytes = Math.floor(prefix / 8);
  const remainder = prefix % 8;
  for (let index = 0; index < fullBytes; index += 1) {
    if (ip[index] !== networkBytes[index]) return false;
  }
  if (remainder === 0) return true;
  const mask = (0xff << (8 - remainder)) & 0xff;
  return ((ip[fullBytes] ?? 0) & mask) === ((networkBytes[fullBytes] ?? 0) & mask);
}

const BLOCKED_IPV6_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
];

function isPrivateIpv6(ip: string): boolean {
  const bytes = ipv6Bytes(ip);
  if (!bytes) return true;
  return BLOCKED_IPV6_CIDRS.some(([network, prefix]) => inIpv6Cidr(bytes, network, prefix));
}

function normalizeHostname(hostname: string): string {
  const lower = hostname.toLowerCase().replace(/\.$/, '');
  if (lower.startsWith('[') && lower.endsWith(']')) return lower.slice(1, -1);
  return lower;
}

export function isPrivateIp(ip: string): boolean {
  const normalized = normalizeHostname(ip);
  const family = net.isIP(normalized);
  if (family === 4) return isPrivateIpv4(normalized);
  if (family === 6) return isPrivateIpv6(normalized);
  return true;
}

export function parseAuditUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL. Enter a complete http:// or https:// URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// targets are allowed.');
  }
  if (url.username || url.password) {
    throw new Error('Credentials in URL are not allowed.');
  }
  return url;
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const url = parseAuditUrl(raw);
  const hostname = normalizeHostname(url.hostname);
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new Error('Local/private targets are blocked in Safe Mode.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Private/link-local/special-use IP targets are blocked in Safe Mode.');
    return url;
  }

  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error('DNS resolution returned no addresses.');
  const blocked = addresses.find((item) => isPrivateIp(item.address));
  if (blocked) throw new Error(`Target resolves to blocked address ${blocked.address}.`);
  return url;
}

export async function evaluateBrowserRequest(raw: string): Promise<BrowserRequestDecision> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { allowed: false, category: 'invalid-url', reason: 'Request URL could not be parsed.' };
  }

  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return { allowed: true };
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, category: 'unsupported-scheme', reason: `Scheme ${url.protocol || '(none)'} is not allowed in Safe Mode.` };
  }

  try {
    await assertPublicHttpUrl(url.toString());
    return { allowed: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Request validation failed.';
    const privateNetwork = /local\/private|private\/link-local|special-use|blocked address/i.test(reason);
    return { allowed: false, category: privateNetwork ? 'private-network' : 'validation-failed', reason };
  }
}

export async function isBrowserRequestAllowed(raw: string): Promise<boolean> {
  return (await evaluateBrowserRequest(raw)).allowed;
}
