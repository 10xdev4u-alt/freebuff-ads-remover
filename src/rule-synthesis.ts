import type { RuleDelta } from './rule-registry.js';

export interface AuditGap { route?: string; host?: string; selector?: string; surface?: string }

export function synthesizeDelta(gaps: AuditGap[], source: string): RuleDelta | null {
  const addEndpoints: string[] = [];
  const addHosts: string[] = [];
  const addSelectors: Record<string, string[]> = {};
  for (const g of gaps) {
    if (g.route && !addEndpoints.includes(g.route)) addEndpoints.push(g.route);
    if (g.host && !addHosts.includes(g.host)) addHosts.push(g.host);
    if (g.selector && g.surface) {
      const arr = (addSelectors[g.surface] = addSelectors[g.surface] ?? []);
      if (!arr.includes(g.selector)) arr.push(g.selector);
    }
  }
  if (addEndpoints.length === 0 && addHosts.length === 0 && Object.keys(addSelectors).length === 0) return null;
  return addHosts.length > 0
    ? { addEndpoints, addHosts, addSelectors, source }
    : { addEndpoints, addSelectors, source };
}
