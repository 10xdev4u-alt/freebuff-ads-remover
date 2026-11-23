 
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdInterceptor } from '../src/interceptor.js';
import { StatsStore } from '../src/stats-store.js';
import { ShadowCapture } from '../src/shadow-capture.js';
import { BlockLog } from '../src/block-log.js';
import { MissLog } from '../src/miss-log.js';
import { OutcomeLog } from '../src/outcome-log.js';
import { RuleRegistry } from '../src/rule-registry.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { Config } from '../src/config.js';

function tmp(prefix: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), prefix)), 'log.jsonl');
}

function config(patch: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...patch };
}

describe('AdInterceptor extra', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('error', false);
  });

  afterEach(() => vi.restoreAllMocks());

  it('updates the shadow config when present', () => {
    const shadow = new ShadowCapture({ enabled: true });
    const spy = vi.spyOn(shadow, 'updateConfig');
    const ic = new AdInterceptor(config(), logger, undefined, shadow);
    ic.updateConfig(config());
    expect(spy).toHaveBeenCalled();
  });

  it('captures but does not block when the extension is disabled', () => {
    const shadow = new ShadowCapture({ enabled: true, captureDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cap-')) });
    const record = vi.spyOn(shadow, 'record').mockImplementation(() => {});
    const ic = new AdInterceptor(config({ enabled: false }), logger, undefined, shadow);
    const result = ic.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    expect(result.blocked).toBe(false);
    expect(record).toHaveBeenCalled();
  });

  it('allows tracking requests when blockTracking is off, but still blocks ad content', () => {
    const shadow = new ShadowCapture({ enabled: true, captureDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cap-')) });
    const record = vi.spyOn(shadow, 'record').mockImplementation(() => {});
    const ic = new AdInterceptor(config({ blockTracking: false }), logger, undefined, shadow);

    const tracking = ic.intercept('http://127.0.0.1:5174/api/ad/impression', 'POST');
    expect(tracking.blocked).toBe(false);
    expect(record).toHaveBeenCalled();

    record.mockClear();
    const ad = ic.intercept('http://127.0.0.1:5174/api/ad/policy', 'POST');
    expect(ad.blocked).toBe(true);
  });

  it('dry-run host and pattern blocks report blocked false while recording', () => {
    const shadow = new ShadowCapture({ enabled: true, dryRun: true, captureDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cap-')) });
    const record = vi.spyOn(shadow, 'record').mockImplementation(() => {});
    const ic = new AdInterceptor(config({ adHosts: ['ads.example.com'] }), logger, undefined, shadow);

    const host = ic.intercept('https://ads.example.com/asset.js', 'GET');
    expect(host.blocked).toBe(false);
    expect(record.mock.calls[0]?.[0]).toMatchObject({ decision: { blocked: false } });

    record.mockClear();
    const pattern = ic.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    expect(pattern.blocked).toBe(false);
    expect(record.mock.calls[0]?.[0]).toMatchObject({ decision: { blocked: false } });
  });

  it('logs misses for ad-shaped routes that slip through', () => {
    const missLog = new MissLog(tmp('miss-'));
    const onMiss = vi.fn();
    const ic = new AdInterceptor(config(), logger, undefined, null, null, null, missLog, onMiss);
    const result = ic.intercept('https://freebuff.com/api/display-ad/foo', 'POST');
    expect(result.blocked).toBe(false);
    expect(onMiss).toHaveBeenCalledWith('/api/display-ad/foo');
    const entries = missLog.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ route: '/api/display-ad/foo', host: 'freebuff.com' });
  });

  it('captures allowed non-ad requests', () => {
    const shadow = new ShadowCapture({ enabled: true, captureDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cap-')) });
    const record = vi.spyOn(shadow, 'record').mockImplementation(() => {});
    const ic = new AdInterceptor(config(), logger, undefined, shadow);
    expect(ic.intercept('http://127.0.0.1:5174/api/user/me', 'GET').blocked).toBe(false);
    expect(record).toHaveBeenCalled();
  });

  it('host matching ignores invalid URLs, first-party hosts and blank entries', () => {
    const ic = new AdInterceptor(config({ adHosts: [''] }), logger);
    expect(ic.intercept('not a url', 'GET').blocked).toBe(false);

    const firstParty = new AdInterceptor(config({ adHosts: ['127.0.0.1'] }), logger);
    expect(firstParty.intercept('http://127.0.0.1:5174/api/user/me', 'GET').blocked).toBe(false);

    const blank = new AdInterceptor(config({ adHosts: [''] }), logger);
    expect(blank.intercept('https://ads.example.com/x', 'GET').blocked).toBe(false);
  });

  it('blocks a configured ad host on any path', () => {
    const ic = new AdInterceptor(config({ adHosts: ['ads.example.com'] }), logger);
    const result = ic.intercept('https://ads.example.com/asset.js', 'GET');
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('ads.example.com');
  });

  it('blocks a host promoted into the registry', () => {
    const registry = new RuleRegistry();
    registry.apply({ addEndpoints: [], addHosts: ['ads.example.com'], addSelectors: {}, source: 'heal' });
    const ic = new AdInterceptor(config(), logger, undefined, null, registry);
    expect(ic.intercept('https://ads.example.com/asset.js', 'GET').blocked).toBe(true);
  });

  it('writes an outcome entry for feed-sourced rules', () => {
    const registry = new RuleRegistry();
    registry.apply({ addEndpoints: ['/api/ad/break'], addSelectors: {}, source: 'feed:2026-01-01' });
    const outcomeLog = new OutcomeLog(tmp('out-'));
    const blockLog = new BlockLog(tmp('block-'));
    const ic = new AdInterceptor(config(), logger, new StatsStore(), null, registry, blockLog, null, null, outcomeLog);
    ic.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    const entries = outcomeLog.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ healHash: 'feed:2026-01-01', suppressed: true });
  });

  it('records blocks in the stats, block log and shadow capture', () => {
    const stats = new StatsStore();
    const shadow = new ShadowCapture({ enabled: true, captureDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cap-')) });
    const record = vi.spyOn(shadow, 'record').mockImplementation(() => {});
    const blockLog = new BlockLog(tmp('block-'));
    const ic = new AdInterceptor(config(), logger, stats, shadow, null, blockLog);
    ic.activate();
    ic.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    expect(ic.getStats().blockCount).toBe(1);
    expect(blockLog.read()).toHaveLength(1);
    expect(record).toHaveBeenCalled();
    ic.deactivate();
    expect(ic.isActive()).toBe(false);
  });

  it('exposes placement ids and syncs patterns from the registry', () => {
    const registry = new RuleRegistry();
    const ic = new AdInterceptor(config(), logger, undefined, null, registry);
    expect(Object.keys(ic.getPlacementIds()).length).toBeGreaterThan(0);
    registry.apply({ addEndpoints: ['/api/ad/custom'], addSelectors: {}, source: 'test' });
    ic.syncPatterns();
    expect(ic.intercept('http://127.0.0.1:5174/api/ad/custom', 'POST').blocked).toBe(true);
  });
});
