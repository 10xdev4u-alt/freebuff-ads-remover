import type { RuleRegistry, RuleDelta } from './rule-registry.js';
import { ShieldStateStore } from './shield-state.js';

export interface PromotionCandidate { id: string; observations: number; delta: RuleDelta }

export class PromotionEngine {
  private state: ShieldStateStore;
  private promoteAfter: number;
  private maxPromotedRules: number;
  private enabled: boolean;
  private registry: RuleRegistry;
  private rollbackOnFailure: boolean;

  constructor(opts: { promoteAfter: number; enabled: boolean; registry: RuleRegistry; statePath: string; maxPromotedRules?: number; rollbackOnFailure?: boolean }) {
    this.promoteAfter = opts.promoteAfter;
    this.enabled = opts.enabled;
    this.registry = opts.registry;
    this.maxPromotedRules = opts.maxPromotedRules ?? 25;
    this.rollbackOnFailure = opts.rollbackOnFailure ?? true;
    if (!this.rollbackOnFailure) this.rollbackOnFailure = false;
    this.state = new ShieldStateStore(opts.statePath);
  }

  beginLaunch(): string { return this.state.beginLaunch(); }

  observe(id: string): void {
    this.state.observe(id, this.state.launchId);
  }

  eligible(): string[] {
    if (!this.enabled) return [];
    return this.state.eligible(this.promoteAfter);
  }

  canPromote(): boolean {
    return this.state.promotedCount() < this.maxPromotedRules;
  }

  promote(id: string, delta: RuleDelta): boolean {
    if (!this.enabled) return false;
    if (this.state.isQuarantined(id)) return false;
    if (!this.canPromote()) return false;
    this.registry.apply(delta);
    this.state.promote(id, delta.source);
    return true;
  }

  quarantine(id: string, reason: string): void {
    this.state.quarantine(id, reason);
  }

  isQuarantined(id: string): boolean { return this.state.isQuarantined(id); }

  rollback(): void {
    if (!this.rollbackOnFailure) return;
    this.registry.rollback();
  }

  stateStore(): ShieldStateStore { return this.state; }
}
