import type { BrowserContext, Route } from 'playwright';
import type { RuntimeNetworkEntry } from '../shared/types.js';
import { recordNetwork, type RuntimeCollector } from '../runtime/collector.js';
import { evaluateBrowserRequest, isPotentiallyDestructiveGetUrl } from './url-policy.js';
import { redactUrl } from '../privacy/redaction.js';

const ALLOWED_READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface SafeModeOptions {
  blockNetwork?: () => boolean;
}

export type RuntimeCollectorSource = RuntimeCollector | (() => RuntimeCollector);

function activeRuntime(source: RuntimeCollectorSource): RuntimeCollector {
  return typeof source === 'function' ? source() : source;
}

export async function installSafeMode(context: BrowserContext, runtimeSource: RuntimeCollectorSource, options: SafeModeOptions = {}): Promise<void> {
  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    const method = request.method().toUpperCase();
    const rawUrl = request.url();

    if (options.blockNetwork?.() && /^https?:/i.test(rawUrl)) {
      activeRuntime(runtimeSource).markPolicyBlock(request, {
        kind: 'skipped-safely',
        method,
        url: redactUrl(rawUrl),
        reason: 'Interaction activation firewall blocked network activity.',
      });
      await route.abort('blockedbyclient');
      return;
    }

    if (!ALLOWED_READ_ONLY_METHODS.has(method)) {
      activeRuntime(runtimeSource).markPolicyBlock(request, {
        kind: 'skipped-safely',
        method,
        url: redactUrl(rawUrl),
        reason: 'Safe Mode blocked a non-read-only HTTP method.',
      });
      await route.abort('blockedbyclient');
      return;
    }

    if ((method === 'GET' || method === 'HEAD') && isPotentiallyDestructiveGetUrl(rawUrl)) {
      activeRuntime(runtimeSource).markPolicyBlock(request, {
        kind: 'skipped-safely',
        method,
        url: redactUrl(rawUrl),
        reason: 'Safe Mode blocked a potentially destructive GET action URL.',
      });
      await route.abort('blockedbyclient');
      return;
    }

    const decision = await evaluateBrowserRequest(rawUrl);
    if (!decision.allowed) {
      const kind: RuntimeNetworkEntry['kind'] = decision.category === 'private-network'
        ? 'blocked-private-network'
        : decision.category === 'validation-failed'
          ? 'request-validation-failed'
          : 'policy-blocked';
      activeRuntime(runtimeSource).markPolicyBlock(request, { kind, method, url: redactUrl(rawUrl), reason: decision.reason });
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  await context.routeWebSocket(/.*/, async (socket) => {
    recordNetwork(activeRuntime(runtimeSource), {
      kind: 'websocket-blocked',
      method: 'WEBSOCKET',
      url: redactUrl(socket.url()),
      reason: 'Safe Mode blocks WebSocket connections because automatic side-effect safety cannot be proven.',
    });
    await socket.close({ code: 1008, reason: 'Blocked by Visual QA Safe Mode' });
  });
}
