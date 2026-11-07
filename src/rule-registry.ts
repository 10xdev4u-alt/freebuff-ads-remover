import crypto from 'node:crypto';
import { AD_ENDPOINTS, AD_CSS_SELECTORS } from './types.js';

export interface RuleSet {
  version: number;
  endpoints: string[];
  selectors: Record<string, string[]>;
  source: string;
  hash: string;
}

export interface RuleDelta {
  addEndpoints: string[];
  addSelectors: Record<string, string[]>;
  source: string;
}

export function hashRuleSet(rs: { endpoints: string[]; selectors: Record<string, string[]> }): string {
  const canonical = JSON.stringify({ endpoints: [...rs.endpoints].sort(), selectors: rs.selectors });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function baseRuleSet(): RuleSet {
  const endpoints = [...AD_ENDPOINTS];
  const selectors = { ...AD_CSS_SELECTORS } as Record<string, string[]>;
  return { version: 1, endpoints, selectors, source: 'static', hash: hashRuleSet({ endpoints, selectors }) };
}

export class RuleRegistry {
  private currentSet: RuleSet;
  private history: RuleSet[] = [];

  constructor(initial?: RuleSet) {
    this.currentSet = initial ? { ...initial } : baseRuleSet();
  }

  current(): RuleSet {
    return this.currentSet;
  }

  apply(delta: RuleDelta): RuleSet {
    const endpoints = [...this.currentSet.endpoints];
    for (const e of delta.addEndpoints) if (!endpoints.includes(e)) endpoints.push(e);
    const selectors: Record<string, string[]> = { ...this.currentSet.selectors };
    for (const [k, v] of Object.entries(delta.addSelectors)) {
      selectors[k] = [...(selectors[k] ?? []), ...v.filter((x) => !(selectors[k] ?? []).includes(x))];
    }
    const next: RuleSet = {
      version: this.currentSet.version + 1,
      endpoints,
      selectors,
      source: delta.source,
      hash: '',
    };
    next.hash = hashRuleSet(next);
    this.history.push(this.currentSet);
    this.currentSet = next;
    return next;
  }

  rollback(): RuleSet | null {
    const prev = this.history.pop();
    if (!prev) return null;
    this.currentSet = prev;
    return prev;
  }
}
