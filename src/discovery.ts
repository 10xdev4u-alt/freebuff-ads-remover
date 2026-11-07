/**
 * Discovery heuristics: propose new ad-endpoint candidates from a capture.
 * Never auto-applies. Reuses the audit's NOT_AD guard.
 */
import type { ShadowEntry } from './shadow-capture.js';

const AD_TOKENS = /ad|ads|sponsor|bid|impression|click|engagement|telemetry|creative|monet/i;
const NOT_AD = /admission|adapter|address|admin|gradient/i;

export interface DiscoveredCandidate {
  path: string;
  count: number;
  suggestedSurface: string;
}

export function discover(entries: ShadowEntry[], minCount = 3): DiscoveredCandidate[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (e.decision.blocked) continue; // already blocked
    if (!AD_TOKENS.test(e.path)) continue;
    if (NOT_AD.test(e.path)) continue;
    counts.set(e.path, (counts.get(e.path) || 0) + 1);
  }
  const out: DiscoveredCandidate[] = [];
  for (const [path, count] of counts) {
    if (count < minCount) continue;
    out.push({ path, count, suggestedSurface: 'sponsorBreak' });
  }
  return out.sort((a, b) => b.count - a.count);
}
