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

import { CONTROL_ROUTES } from './candidates.js';

export function isControlRoute(route: string): boolean {
  // Explicit allow-list of known-good endpoints. The previous `!isAdRoute`
  // implementation was a dead no-op that rejected nothing while implying a
  // safety guarantee. An unknown route is NOT automatically a control route.
  return CONTROL_ROUTES.has(route);
}

export function normalizeRoute(route: string): string {
  return (route.replace(/\$\{[^}]*\}/g, ":param").split("?")[0] || route);
}
