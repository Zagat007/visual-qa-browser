function normalizeHost(value: string): string {
  return value.trim().toLowerCase();
}

export function allowedControlPlaneHosts(port: number): Set<string> {
  return new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
  ]);
}

export function isAllowedControlPlaneHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false;
  return allowedControlPlaneHosts(port).has(normalizeHost(hostHeader));
}

export function isAllowedApiOrigin(originHeader: string | undefined, port: number): boolean {
  if (!originHeader) return true;
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }
  if (origin.protocol !== 'http:') return false;
  return allowedControlPlaneHosts(port).has(normalizeHost(origin.host));
}

export function isCrossSiteFetch(secFetchSite: string | undefined): boolean {
  return typeof secFetchSite === 'string' && secFetchSite.toLowerCase() === 'cross-site';
}
