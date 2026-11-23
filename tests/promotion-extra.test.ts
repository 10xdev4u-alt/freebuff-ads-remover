import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { RuleRegistry } from '../src/rule-registry.js';
import { PromotionEngine } from '../src/promotion.js';
import type { AdInterceptor } from '../src/interceptor.js';
import type { RuntimeVerifier, VerificationReport } from '../src/runtime-verifier.js';

const repo = path.resolve(__dirname, '..');
const corpusDir = path.join(repo, 'corpus');

function makeEngine(tmp: string, opts: Partial<ConstructorParameters<typeof PromotionEngine>[0]> = {}): PromotionEngine {
  return new PromotionEngine({
    promoteAfter: 1,
    enabled: true,
    registry: new RuleRegistry(),
    statePath: path.join(tmp, 'shield-state.json'),
    corpusDir,
    configDir: tmp,
    ...opts,
  });
}

function verifier(report: VerificationReport): RuntimeVerifier {
  return { run: vi.fn(async () => report) } as unknown as RuntimeVerifier;
}

describe('promotion engine extra branches', () => {
  it('uses the injected live gate when one is set', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const seen: string[] = [];
    const engine = makeEngine(tmp, {
      runtimeVerifier: verifier({ pass: true, targets: 1, probes: [], at: Date.now() }),
    });
    engine.setLiveGate(async (_v, route) => {
      seen.push(route);
      return { pass: true, targets: 1, probes: [], at: Date.now() };
    });
    engine.beginLaunch();
    engine.observe('route:/api/ad/wave29-proof');
    const results = await engine.tick();
    expect(results[0]?.status).toBe('promoted');
    expect(seen).toEqual(['/api/ad/wave29-proof']);
  });

  it('rolls back without a reason when the live report has none', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const syncPatterns = vi.fn();
    const engine = makeEngine(tmp, {
      registry: new RuleRegistry(),
      interceptor: { syncPatterns } as unknown as AdInterceptor,
      runtimeVerifier: verifier({ pass: false, targets: 1, probes: [], at: Date.now() }),
    });
    engine.beginLaunch();
    engine.observe('route:/api/ad/wave29-proof');
    const results = await engine.tick();
    expect(results[0]?.status).toBe('rolled-back');
    expect(results[0]?.reason).toBeUndefined();
    expect(engine.isQuarantined('route:/api/ad/wave29-proof')).toBe(true);
  });

  it('promote() refuses when the engine is disabled', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const engine = makeEngine(tmp, { enabled: false });
    expect(engine.promote('route:/api/ad/x', { addEndpoints: ['/api/ad/x'], addSelectors: {}, source: 't' })).toBe(false);
  });

  it('promote() refuses when the promotion quota is exhausted', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const engine = makeEngine(tmp, { maxPromotedRules: 0 });
    expect(engine.promote('route:/api/ad/x', { addEndpoints: ['/api/ad/x'], addSelectors: {}, source: 't' })).toBe(false);
  });

  it('rollback() is a no-op when rollbackOnFailure is false', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const registry = new RuleRegistry();
    const engine = makeEngine(tmp, { registry, rollbackOnFailure: false });
    registry.apply({ addEndpoints: ['/api/ad/x'], addSelectors: {}, source: 't' });
    expect(() => { engine.rollback(); }).not.toThrow();
    expect(registry.current().endpoints).toContain('/api/ad/x');
  });
});
