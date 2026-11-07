export function canonicalize(raw: string): string {
  let u: URL;
  try { u = new URL(raw); } catch {
    // path-only
    return raw.replace(/\/{2,}/g, '/').toLowerCase();
  }
  const host = u.hostname.toLowerCase();
  const port = u.port && u.port !== '80' && u.port !== '443' ? ':' + u.port : '';
  const path = u.pathname.replace(/\/{2,}/g, '/').toLowerCase();
  const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const qs = params.length ? '?' + params.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&') : '';
  return `${u.protocol}//${host}${port}${path}${qs}`;
}

export function matchRoute(url: string, pattern: string): boolean {
  // path-only pattern
  if (!pattern.includes('://')) {
    let pathname = url;
    try { pathname = new URL(url).pathname; } catch { /* keep */ }
    const cp = pattern.toLowerCase();
    const cu = decodeURIComponent(pathname).toLowerCase();
    return cu.includes(cp);
  }
  const cu = canonicalize(url);
  const cp = canonicalize(pattern);
  if (cp.endsWith('/')) return cu.startsWith(cp);
  return cu === cp || cu.startsWith(cp + '/') || cu.startsWith(cp + '?');
}
