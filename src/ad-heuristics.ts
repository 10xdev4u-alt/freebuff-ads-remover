// Shared ad-route heuristics used by both the runtime interceptor and the
// audit tool. One source of truth so the observer and the synthesizer agree.
export function isAdRoute(route: string): boolean {
  const AD_ROUTE = /(^|\/)ad(s)?\//i;
  const AD_EXTRA = /ad-density|display-ad|sponsored-survey|creative-image/i;
  const NOT_AD = /admission|adapter|address|admin/i;
  const IGNORE = new Set(['/api/ad/']);
  if (IGNORE.has(route)) return false;
  if (NOT_AD.test(route)) return false;
  return AD_ROUTE.test(route) || AD_EXTRA.test(route);
}

export function isControlRoute(route: string): boolean {
  // A control route is anything that is not an ad route. Used by the gate to
  // reject synthesized rules that would block a known-good endpoint.
  return !isAdRoute(route);
}

export function normalizeRoute(route: string): string {
  return (route.replace(/\$\{[^}]*\}/g, ":param").split("?")[0] || route);
}
