import type { RuleDelta } from './rule-registry.js';

export interface AuditGap { route?: string; selector?: string; surface?: string }

export function synthesizeDelta(gaps: AuditGap[], source: string): RuleDelta | null {
  const addEndpoints: string[] = [];
  const addSelectors: Record<string, string[]> = {};
  for (const g of gaps) {
    if (g.route && !addEndpoints.includes(g.route)) addEndpoints.push(g.route);
    if (g.selector && g.surface) {
      const arr = (addSelectors[g.surface] = addSelectors[g.surface] ?? []);
      if (!arr.includes(g.selector)) arr.push(g.selector);
    }
  }
  if (addEndpoints.length === 0 && Object.keys(addSelectors).length === 0) return null;
  return { addEndpoints, addSelectors, source };
}
