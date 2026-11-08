import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { RuleRegistry } from '../src/rule-registry.js';
import { PromotionEngine } from '../src/promotion.js';
import type { AdInterceptor } from '../src/interceptor.js';
import type { RuntimeVerifier, VerificationReport } from '../src/runtime-verifier.js';

const repo = path.resolve(__dirname, '..');
const corpusDir = path.join(repo, 'corpus');

describe('runtime promotion', () => {
  beforeAll(() => {
    if (!fs.existsSync(path.join(repo, 'dist', 'interceptor.js'))) {
      // build not required for these unit tests
    }
  });

  it('observes and becomes eligible after promoteAfter launches', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const statePath = path.join(tmp, 'shield-state.json');
    const engine = new PromotionEngine({
      promoteAfter: 2,
      enabled: true,
      registry: new RuleRegistry(),
      statePath,
      corpusDir,
      configDir: tmp,
    });
    engine.beginLaunch();
    engine.observe('route:/api/ad/wave29-proof');
    engine.beginLaunch();
    engine.observe('route:/api/ad/wave29-proof');
    expect(engine.eligible()).toContain('route:/api/ad/wave29-proof');
  });

  it('quarantines a candidate that fails the static gate', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const statePath = path.join(tmp, 'shield-state.json');
    const engine = new PromotionEngine({
      promoteAfter: 1,
      enabled: true,
      registry: new RuleRegistry(),
      statePath,
      corpusDir,
      configDir: tmp,
    });
    engine.beginLaunch();
    engine.observe('route:/healthz');
    const results = await engine.tick();
    expect(results[0]?.status).toBe('quarantined');
    expect(engine.isQuarantined('route:/healthz')).toBe(true);
  });

  it('promotes a valid candidate, rebuilds patterns, and persists', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const statePath = path.join(tmp, 'shield-state.json');
    const registry = new RuleRegistry();
    const syncPatterns = vi.fn();
    const interceptor = { syncPatterns } as unknown as AdInterceptor;
    const engine = new PromotionEngine({
      promoteAfter: 1,
      enabled: true,
      registry,
      statePath,
      corpusDir,
      configDir: tmp,
      interceptor,
    });
    engine.beginLaunch();
    engine.observe('route:/api/ad/wave29-proof');
    const results = await engine.tick();
    expect(results[0]?.status).toBe('promoted');
    expect(syncPatterns).toHaveBeenCalled();
    expect(fs.existsSync(path.join(tmp, 'rules.json'))).toBe(true);
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'rules.json'), 'utf8')) as { endpoints: string[] };
    expect(saved.endpoints).toContain('/api/ad/wave29-proof');
  });

  it('rolls back and quarantines when the live gate fails', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const statePath = path.join(tmp, 'shield-state.json');
    const registry = new RuleRegistry();
    const syncPatterns = vi.fn();
    const interceptor = { syncPatterns } as unknown as AdInterceptor;
    const verifier = {
      run: async (): Promise<VerificationReport> => ({ pass: false, reason: 'control-not-reached', targets: 1, probes: [], at: Date.now() }),
    } as unknown as RuntimeVerifier;
    const engine = new PromotionEngine({
      promoteAfter: 1,
      enabled: true,
      registry,
      statePath,
      corpusDir,
      configDir: tmp,
      interceptor,
      runtimeVerifier: verifier,
    });
    engine.beginLaunch();
    engine.observe('route:/api/ad/wave29-proof');
    const results = await engine.tick();
    expect(results[0]?.status).toBe('rolled-back');
    expect(engine.isQuarantined('route:/api/ad/wave29-proof')).toBe(true);
    const saved = JSON.parse(fs.readFileSync(path.join(tmp, 'rules.json'), 'utf8')) as { endpoints: string[] };
    expect(saved.endpoints).not.toContain('/api/ad/wave29-proof');
  });

  it('respects maxPromotedRules', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-promo-'));
    const statePath = path.join(tmp, 'shield-state.json');
    const engine = new PromotionEngine({
      promoteAfter: 1,
      enabled: true,
      registry: new RuleRegistry(),
      statePath,
      maxPromotedRules: 0,
      corpusDir,
      configDir: tmp,
    });
    engine.beginLaunch();
    engine.observe('route:/api/ad/wave29-proof');
    const results = await engine.tick();
    expect(results).toHaveLength(0);
  });
});
