import type { RuleRegistry, RuleDelta } from './rule-registry.js';
import type { AdInterceptor } from './interceptor.js';
import type { RuntimeVerifier, VerificationReport } from './runtime-verifier.js';
import { ShieldStateStore } from './shield-state.js';
import { synthesizeDelta } from './rule-synthesis.js';
import { verifyDelta } from './delta-gate.js';

export interface PromotionCandidate { id: string; observations: number; delta: RuleDelta }

export type PromotionStatus = 'promoted' | 'quarantined' | 'rolled-back' | 'skipped';

export interface PromotionResult {
  id: string;
  status: PromotionStatus;
  reason?: string;
}

export class PromotionEngine {
  private state: ShieldStateStore;
  private promoteAfter: number;
  private maxPromotedRules: number;
  private enabled: boolean;
  private registry: RuleRegistry;
  private rollbackOnFailure: boolean;
  private corpusDir: string;
  private configDir: string;
  private interceptor: AdInterceptor | null;
  private runtimeVerifier: RuntimeVerifier | null;
  private liveGate: ((verifier: RuntimeVerifier, route: string) => Promise<VerificationReport>) | null = null;

  constructor(opts: {
    promoteAfter: number;
    enabled: boolean;
    registry: RuleRegistry;
    statePath: string;
    maxPromotedRules?: number;
    rollbackOnFailure?: boolean;
    corpusDir: string;
    configDir: string;
    interceptor?: AdInterceptor | null;
    runtimeVerifier?: RuntimeVerifier | null;
  }) {
    this.promoteAfter = opts.promoteAfter;
    this.enabled = opts.enabled;
    this.registry = opts.registry;
    this.maxPromotedRules = opts.maxPromotedRules ?? 25;
    this.rollbackOnFailure = opts.rollbackOnFailure ?? true;
    this.corpusDir = opts.corpusDir;
    this.configDir = opts.configDir;
    this.interceptor = opts.interceptor ?? null;
    this.runtimeVerifier = opts.runtimeVerifier ?? null;
    this.state = new ShieldStateStore(opts.statePath);
  }

  setInterceptor(interceptor: AdInterceptor | null): void { this.interceptor = interceptor; }
  setRuntimeVerifier(verifier: RuntimeVerifier | null): void { this.runtimeVerifier = verifier; }
  setLiveGate(fn: ((verifier: RuntimeVerifier, route: string) => Promise<VerificationReport>) | null): void { this.liveGate = fn; }

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

  async tick(): Promise<PromotionResult[]> {
    if (!this.enabled) return [];
    const results: PromotionResult[] = [];
    for (const id of this.eligible()) {
      if (!this.canPromote()) break;
      const route = id.replace(/^route:/, '');
      const delta = synthesizeDelta([{ route }], 'runtime-promoted');
      if (!delta) { results.push({ id, status: 'skipped', reason: 'no-delta' }); continue; }

      const gate = verifyDelta(delta, this.registry, this.corpusDir);
      if (!gate.pass) {
        this.state.quarantine(id, gate.reason ?? 'static-gate');
        if (gate.reason) results.push({ id, status: 'quarantined', reason: gate.reason });
        else results.push({ id, status: 'quarantined' });
        continue;
      }

      this.registry.apply(delta);
      this.interceptor?.syncPatterns();
      try { this.registry.save(this.configDir); } catch { /* fail open */ }

      let livePass = true;
      let liveReason: string | undefined;
      if (this.runtimeVerifier) {
        try {
          const report: VerificationReport = this.liveGate
            ? await this.liveGate(this.runtimeVerifier, route)
            : await this.runtimeVerifier.run([route]);
          livePass = report.pass;
          liveReason = report.reason;
        } catch {
          livePass = false;
          liveReason = 'verifier-error';
        }
      }

      if (livePass) {
        this.state.promote(id, this.registry.current().hash);
        results.push({ id, status: 'promoted' });
      } else {
        if (this.rollbackOnFailure) {
          this.registry.rollback();
          try { this.registry.save(this.configDir); } catch { /* ignore */ }
          this.interceptor?.syncPatterns();
        }
        this.state.quarantine(id, liveReason ?? 'live-gate');
        if (liveReason) results.push({ id, status: 'rolled-back', reason: liveReason });
        else results.push({ id, status: 'rolled-back' });
      }
    }
    return results;
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
