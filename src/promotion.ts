export interface PromotionCandidate { id: string; observations: number; delta: unknown }

export class PromotionEngine {
  private candidates: Map<string, PromotionCandidate> = new Map();
  private promoteAfter: number;
  private enabled: boolean;

  constructor(opts: { promoteAfter: number; maxPromoted: number; enabled: boolean }) {
    this.promoteAfter = opts.promoteAfter;
    this.enabled = opts.enabled;
  }

  observe(id: string, delta: unknown): void {
    const c = this.candidates.get(id) ?? { id, observations: 0, delta };
    c.observations += 1;
    c.delta = delta;
    this.candidates.set(id, c);
  }

  eligible(): PromotionCandidate[] {
    if (!this.enabled) return [];
    return [...this.candidates.values()].filter((c) => c.observations >= this.promoteAfter);
  }
}
