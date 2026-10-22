import { describe, it, expect, beforeEach } from 'vitest';
import { AdInterceptor } from '../src/interceptor.js';
import { StatsStore } from '../src/stats-store.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_CONFIG } from '../src/types.js';

describe('AdInterceptor', () => {
  let interceptor: AdInterceptor;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('error', false);
    interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);
  });

  it('blocks /api/ad/break', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    expect(result.blocked).toBe(true);
    expect(result.surface).toBe('sponsorBreak');
  });

  it('blocks /api/ad/billboard', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/billboard', 'POST');
    expect(result.blocked).toBe(true);
    expect(result.surface).toBe('billboard');
  });

  it('blocks /api/ad/intermission', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/intermission', 'POST');
    expect(result.blocked).toBe(true);
    expect(result.surface).toBe('intermission');
  });

  it('blocks /api/ad/impression', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/impression', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('blocks /api/ad/click', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/click', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('blocks /api/ad/partner', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/partner', 'POST');
    expect(result.blocked).toBe(true);
    expect(result.surface).toBe('partner');
  });

  it('blocks /api/ad/invitation/click', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/invitation/click', 'POST');
    expect(result.blocked).toBe(true);
    expect(result.surface).toBe('invitation');
  });

  it('blocks 0.0.186 intent and report endpoints', () => {
    expect(interceptor.intercept('http://127.0.0.1:5174/api/ad/intent', 'POST').blocked).toBe(true);
    expect(interceptor.intercept('http://127.0.0.1:5174/api/ad/report', 'POST').blocked).toBe(true);
  });

  it('blocks new invitation subpaths (git review flow)', () => {
    for (const sub of ['inspect', 'preview', 'approve', 'decline', 'open-root']) {
      const result = interceptor.intercept(`http://127.0.0.1:5174/api/ad/invitation/git/${sub}`, 'POST');
      expect(result.blocked, sub).toBe(true);
      expect(result.surface, sub).toBe('invitation');
    }
  });

  it('blocks every remote ad call, not just the agentic offer', () => {
    for (const path of [
      '/api/v1/ads/impression',
      '/api/v1/ads/click',
      '/api/v1/ads/engagement',
      '/api/v1/ads/invitation/event',
      '/api/v1/ads/policy',
      '/api/v1/ads/prefs',
      '/api/v1/ads/sponsored-skills',
    ]) {
      expect(interceptor.intercept(`https://freebuff.com${path}`, 'POST').blocked, path).toBe(true);
    }
  });

  it('blocks sponsored survey prompts', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/sponsored-survey', 'POST');
    expect(result.blocked).toBe(true);
    expect(result.surface).toBe('invitation');
  });

  it('blocks ad-density telemetry', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/telemetry/ad-density', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('blocks /api/ad/break-event', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/break-event', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('blocks remote agentic offer', () => {
    const result = interceptor.intercept('https://freebuff.com/api/v1/ads/agentic/offer', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('blocks /api/ads', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ads', 'GET');
    expect(result.blocked).toBe(true);
  });

  it('allows non-ad requests', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/account/usage', 'GET');
    expect(result.blocked).toBe(false);
  });

  it('allows chat requests', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/chat', 'POST');
    expect(result.blocked).toBe(false);
  });

  it('tracks request and block counts', () => {
    interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    interceptor.intercept('http://127.0.0.1:5174/api/chat', 'POST');
    const stats = interceptor.getStats();
    expect(stats.requestCount).toBe(2);
    expect(stats.blockCount).toBe(1);
  });

  it('respects disabled config', () => {
    const config = { ...DEFAULT_CONFIG, enabled: false };
    const disabledInterceptor = new AdInterceptor(config, logger);
    const result = disabledInterceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    expect(result.blocked).toBe(false);
  });

  it('updates config dynamically', () => {
    interceptor.updateConfig({ ...DEFAULT_CONFIG, surfaces: { ...DEFAULT_CONFIG.surfaces, billboard: false } });
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/billboard', 'POST');
    expect(result.blocked).toBe(false);
  });

  it('activates and deactivates', () => {
    interceptor.activate();
    expect(interceptor.isActive()).toBe(true);
    interceptor.deactivate();
    expect(interceptor.isActive()).toBe(false);
  });

  it('exposes placement IDs', () => {
    const placements = interceptor.getPlacementIds();
    expect(placements.intermission).toBe('Desktop-Intermission');
    expect(placements.billboardSidebar).toBe('Desktop-Billboard-Sidebar');
  });

  it('blocks all tracking endpoints when blockTracking is true', () => {
    const trackingEndpoints = [
      '/api/ad/impression',
      '/api/ad/click',
      '/api/ad/click-return',
      '/api/ad/engagement',
    ];

    for (const endpoint of trackingEndpoints) {
      const result = interceptor.intercept(`http://127.0.0.1:5174${endpoint}`, 'POST');
      expect(result.blocked).toBe(true);
    }
  });

  it('blocks proposal endpoints', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/proposal', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('blocks slot endpoint', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/slot', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('blocks policy endpoint', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/policy', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('reports the stage a blocked request died at', () => {
    expect(
      interceptor.intercept('http://127.0.0.1:5174/api/ad/policy', 'POST').stage,
    ).toBe('policy');
    expect(
      interceptor.intercept('http://127.0.0.1:5174/api/ad/impression', 'POST').stage,
    ).toBe('delivery');
    expect(
      interceptor.intercept('http://127.0.0.1:5174/api/ad/slot', 'POST').stage,
    ).toBe('inventory');
    expect(
      interceptor.intercept('http://127.0.0.1:5174/api/unknown', 'GET').blocked,
    ).toBe(false);
  });

  it('records blocked requests into the stats store', () => {
    const store = new StatsStore(() => 1_000);
    const withStats = new AdInterceptor(DEFAULT_CONFIG, logger, store);
    withStats.intercept('http://127.0.0.1:5174/api/ad/impression', 'POST');
    withStats.intercept('http://127.0.0.1:5174/api/ad/impression', 'POST');
    withStats.intercept('http://127.0.0.1:5174/api/chat', 'POST');

    const snap = store.snapshot();
    expect(snap.total).toBe(2);
    expect(snap.byStage.delivery).toBe(2);
    expect(snap.bySurface.sponsorBreak).toBe(2);
    expect(snap.byEndpoint['/api/ad/impression']).toBe(2);
    expect(snap.recent[0]).toEqual({
      stage: 'delivery',
      surface: 'sponsorBreak',
      endpoint: '/api/ad/impression',
      at: 1_000,
    });
  });

  it('does not record when blocking is disabled', () => {
    const store = new StatsStore(() => 1_000);
    const disabled = new AdInterceptor({ ...DEFAULT_CONFIG, enabled: false }, logger, store);
    disabled.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    expect(store.snapshot().total).toBe(0);
  });

  it('works without a stats store', () => {
    const result = interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    expect(result.blocked).toBe(true);
  });

  it('precomputes stage on each active pattern', () => {
    const patterns = interceptor
      .getStats()
      .patterns;
    expect(patterns).toBeGreaterThan(0);
    const anyResult = interceptor.intercept('http://127.0.0.1:5174/api/ad/proposal', 'POST');
    expect(anyResult.stage).toBe('bid');
  });
});
