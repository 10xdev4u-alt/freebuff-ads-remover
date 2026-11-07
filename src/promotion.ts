import type { RuleRegistry } from './rule-registry.js';

export interface PromotionCandidate { id: string; observations: number; delta: { addEndpoints: string[]; addSelectors: Record<string, string[]>; source: string } }

export class PromotionEngine {
  private candidates: Map<string, PromotionCandidate> = new Map();
  private promoteAfter: number;
  private enabled: boolean;
  private registry: RuleRegistry;

  constructor(opts: { promoteAfter: number; enabled: boolean; registry: RuleRegistry }) {
    this.promoteAfter = opts.promoteAfter;
    this.enabled = opts.enabled;
    this.registry = opts.registry;
  }

  observe(id: string, delta: PromotionCandidate['delta']): void {
    const c = this.candidates.get(id) ?? { id, observations: 0, delta };
    c.observations += 1;
    c.delta = delta;
    this.candidates.set(id, c);
  }

  eligible(): PromotionCandidate[] {
    if (!this.enabled) return [];
    return [...this.candidates.values()].filter((c) => c.observations >= this.promoteAfter);
  }

  promote(c: PromotionCandidate): void {
    this.registry.apply(c.delta);
  }

  rollback(): void {
    this.registry.rollback();
  }
}
