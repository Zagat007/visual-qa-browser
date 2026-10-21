import type { Page, Request, Response } from 'playwright';
import { redactText, redactUrl } from '../privacy/redaction.js';
import type { RuntimeConsoleEntry, RuntimeNetworkEntry } from '../shared/types.js';

const MAX_CONSOLE = 1_000;
const MAX_PAGE_ERRORS = 500;
const MAX_NETWORK = 5_000;
const MAX_RUNTIME_TEXT_CHARS = 8_192;
const MAX_RUNTIME_URL_CHARS = 4_096;
const ASSET_TYPES = new Set(['image', 'stylesheet', 'script', 'font', 'media']);

export interface RuntimeCollector {
  console: RuntimeConsoleEntry[];
  pageErrors: string[];
  network: RuntimeNetworkEntry[];
  limits: { consoleDropped: number; pageErrorsDropped: number; networkDropped: number; textTruncated: number };
  markPolicyBlock: (request: Request, entry: RuntimeNetworkEntry) => void;
}

function requestContext(request: Request): Pick<RuntimeNetworkEntry, 'method' | 'url' | 'resourceType' | 'frameUrl'> {
  let frameUrl: string | undefined;
  try {
    frameUrl = redactUrl(request.frame().url());
  } catch {
    frameUrl = undefined;
  }
  return {
    method: request.method(),
    url: redactUrl(request.url()),
    resourceType: request.resourceType(),
    ...(frameUrl ? { frameUrl } : {}),
  };
}

function responseSize(response: Response): number | undefined {
  const raw = response.headers()['content-length'];
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function responseDuration(request: Request): number | undefined {
  try {
    const value = request.timing().responseEnd;
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : undefined;
  } catch {
    return undefined;
  }
}


function boundedRuntimeText(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false };
  const marker = '…[TRUNCATED]';
  return { value: `${value.slice(0, Math.max(0, maxChars - marker.length))}${marker}`, truncated: true };
}

function boundedNetworkEntry(entry: RuntimeNetworkEntry): { entry: RuntimeNetworkEntry; truncated: boolean } {
  let truncated = false;
  const clamp = (value: string | undefined, max: number): string | undefined => {
    if (value === undefined) return undefined;
    const result = boundedRuntimeText(value, max);
    truncated ||= result.truncated;
    return result.value;
  };
  const url = clamp(entry.url, MAX_RUNTIME_URL_CHARS) ?? '';
  const frameUrl = clamp(entry.frameUrl, MAX_RUNTIME_URL_CHARS);
  const redirectTo = clamp(entry.redirectTo, MAX_RUNTIME_URL_CHARS);
  const reason = clamp(entry.reason, MAX_RUNTIME_TEXT_CHARS);
  const resourceType = clamp(entry.resourceType, 256);
  const method = clamp(entry.method, 64) ?? entry.method;
  return {
    truncated,
    entry: {
      ...entry,
      method,
      url,
      ...(frameUrl === undefined ? {} : { frameUrl }),
      ...(redirectTo === undefined ? {} : { redirectTo }),
      ...(reason === undefined ? {} : { reason }),
      ...(resourceType === undefined ? {} : { resourceType }),
    },
  };
}

export function recordNetwork(collector: RuntimeCollector, entry: RuntimeNetworkEntry): void {
  if (collector.network.length >= MAX_NETWORK) {
    collector.limits.networkDropped += 1;
    return;
  }
  const bounded = boundedNetworkEntry(entry);
  if (bounded.truncated) collector.limits.textTruncated += 1;
  collector.network.push(bounded.entry);
}

export function mergeRuntimeCollector(target: RuntimeCollector, source: RuntimeCollector): void {
  for (const entry of source.console) {
    if (target.console.length >= MAX_CONSOLE) target.limits.consoleDropped += 1;
    else target.console.push(entry);
  }
  target.limits.consoleDropped += source.limits.consoleDropped;
  for (const error of source.pageErrors) {
    if (target.pageErrors.length >= MAX_PAGE_ERRORS) target.limits.pageErrorsDropped += 1;
    else target.pageErrors.push(error);
  }
  target.limits.pageErrorsDropped += source.limits.pageErrorsDropped;
  for (const entry of source.network) recordNetwork(target, entry);
  target.limits.networkDropped += source.limits.networkDropped;
  target.limits.textTruncated += source.limits.textTruncated;
}

export function attachRuntimeCollector(page: Page): RuntimeCollector {
  const policyBlocked = new WeakSet<Request>();
  const data: RuntimeCollector = {
    console: [],
    pageErrors: [],
    network: [],
    limits: { consoleDropped: 0, pageErrorsDropped: 0, networkDropped: 0, textTruncated: 0 },
    markPolicyBlock(request: Request, entry: RuntimeNetworkEntry): void {
      policyBlocked.add(request);
      recordNetwork(data, { ...requestContext(request), ...entry });
    },
  };

  page.on('console', (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    if (data.console.length >= MAX_CONSOLE) {
      data.limits.consoleDropped += 1;
      return;
    }
    const location = message.location();
    const text = boundedRuntimeText(redactText(message.text()), MAX_RUNTIME_TEXT_CHARS);
    const locationUrl = location.url ? boundedRuntimeText(redactUrl(location.url), MAX_RUNTIME_URL_CHARS) : null;
    if (text.truncated || locationUrl?.truncated) data.limits.textTruncated += 1;
    data.console.push({
      type: message.type(),
      text: text.value,
      ...(locationUrl ? {
        location: {
          url: locationUrl.value,
          lineNumber: location.lineNumber,
          columnNumber: location.columnNumber,
        },
      } : {}),
    });
  });

  page.on('pageerror', (error) => {
    if (data.pageErrors.length >= MAX_PAGE_ERRORS) {
      data.limits.pageErrorsDropped += 1;
      return;
    }
    const message = boundedRuntimeText(redactText(error.message), MAX_RUNTIME_TEXT_CHARS);
    if (message.truncated) data.limits.textTruncated += 1;
    data.pageErrors.push(message.value);
  });

  page.on('request', (request) => {
    try {
      const pageUrl = new URL(page.url());
      const requestUrl = new URL(request.url());
      if (pageUrl.protocol === 'https:' && requestUrl.protocol === 'http:') {
        recordNetwork(data, { kind: 'mixed-content', ...requestContext(request), reason: 'HTTPS page requested an HTTP resource.' });
      }
    } catch {
      // Non-HTTP schemes and transient navigation states are not mixed-content findings.
    }
  });

  page.on('requestfailed', (request) => {
    if (policyBlocked.has(request)) return;
    const reason = request.failure()?.errorText ?? 'unknown failure';
    const context = requestContext(request);
    const benignMediaAbort = request.resourceType() === 'media' && /(?:ERR_ABORTED|NS_BINDING_ABORTED|\bcancelled\b|\bcanceled\b)/i.test(reason);
    const blockedByClient = reason.includes('ERR_BLOCKED_BY_CLIENT');
    recordNetwork(data, {
      kind: benignMediaAbort
        ? 'benign-abort'
        : blockedByClient
          ? 'skipped-safely'
        : ASSET_TYPES.has(request.resourceType())
          ? 'asset-error'
          : 'request-failed',
      ...context,
      reason,
    });
  });

  page.on('response', (response) => {
    const request = response.request();
    const context = requestContext(request);
    const status = response.status();
    const redirectedTo = request.redirectedTo();
    if (status >= 300 && status < 400 && redirectedTo) {
      const durationMs = responseDuration(request);
      const sizeBytes = responseSize(response);
      recordNetwork(data, {
        kind: 'redirect',
        ...context,
        status,
        redirectTo: redactUrl(redirectedTo.url()),
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(sizeBytes === undefined ? {} : { sizeBytes }),
      });
      return;
    }
    const kind: RuntimeNetworkEntry['kind'] = status >= 400
      ? ASSET_TYPES.has(request.resourceType()) ? 'asset-error' : 'http-error'
      : 'response';
    const durationMs = responseDuration(request);
    const sizeBytes = responseSize(response);
    recordNetwork(data, {
      kind,
      ...context,
      status,
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(sizeBytes === undefined ? {} : { sizeBytes }),
    });
  });

  return data;
}
