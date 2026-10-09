import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AdInterceptor } from '../../src/interceptor.js';
import { CssInjector } from '../../src/css-injector.js';
import { DEFAULT_CONFIG, HIDE_ALL_ADS_CSS, AD_ENDPOINTS, AD_SURFACES } from '../../src/types.js';
import { Logger } from '../../src/logger.js';

describe('E2E: Full Ad Removal Flow', () => {
  let interceptor: AdInterceptor;
  let cssInjector: CssInjector;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('error', false);
    interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);
    cssInjector = new CssInjector(DEFAULT_CONFIG, logger);
  });

  it('blocks every ad endpoint', () => {
    for (const endpoint of AD_ENDPOINTS) {
      const url = endpoint.startsWith('/api/v1/')
        ? `https://freebuff.com${endpoint}`
        : `http://127.0.0.1:5174${endpoint}`;
      const result = interceptor.intercept(url, 'POST');
      expect(result.blocked).toBe(true);
    }
  });

  it('passes through every non-ad endpoint', () => {
    const nonAdEndpoints = [
      '/api/account/usage',
      '/api/account/skills',
      '/api/chat',
      '/api/auth/status',
      '/api/auth/login/start',
      '/api/byok/account',
      '/api/cloud/projects',
      '/api/desktop/paid-api',
      '/api/appearance/usage',
    ];

    for (const endpoint of nonAdEndpoints) {
      const result = interceptor.intercept(`http://127.0.0.1:5174${endpoint}`, 'GET');
      expect(result.blocked).toBe(false);
    }
  });

  it('CSS fallback covers every ad surface', () => {
    const css = HIDE_ALL_ADS_CSS;
    const surfaceClassPatterns: Record<string, string> = {
      sponsorBreak: '[class*="sponsorBreak"]',
      billboard: '[class*="billboard"]',
      intermission: '[class*="intermission"]',
      spotlight: '[class*="spotlight"]',
      showcase: '[class*="showcase"]',
      sponsoredTask: '[class*="sponsoredTask"]',
      sponsoredRun: '[class*="sponsoredRun"]',
      partner: '[class*="partnerAd"]',
      invitation: '[class*="invitation"]',
    };
    for (const surface of AD_SURFACES) {
      expect(css).toContain(surfaceClassPatterns[surface]);
    }
  });

  it('handles rapid sequential requests', () => {
    for (let i = 0; i < 100; i++) {
      interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    }
    const stats = interceptor.getStats();
    expect(stats.blockCount).toBe(100);
    expect(stats.requestCount).toBe(100);
  });

  it('handles mixed ad and non-ad traffic', () => {
    const requests = [
      { url: 'http://127.0.0.1:5174/api/chat', method: 'POST' },
      { url: 'http://127.0.0.1:5174/api/ad/break', method: 'POST' },
      { url: 'http://127.0.0.1:5174/api/account/usage', method: 'GET' },
      { url: 'http://127.0.0.1:5174/api/ad/impression', method: 'POST' },
      { url: 'http://127.0.0.1:5174/api/chat', method: 'POST' },
    ];

    const results = requests.map((r) => interceptor.intercept(r.url, r.method));
    expect(results[0]!.blocked).toBe(false);
    expect(results[1]!.blocked).toBe(true);
    expect(results[2]!.blocked).toBe(false);
    expect(results[3]!.blocked).toBe(true);
    expect(results[4]!.blocked).toBe(false);

    const stats = interceptor.getStats();
    expect(stats.blockCount).toBe(2);
    expect(stats.requestCount).toBe(5);
  });

  it('survives config toggle mid-session', () => {
    interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    interceptor.updateConfig({ ...DEFAULT_CONFIG, enabled: false });
    interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    interceptor.updateConfig({ ...DEFAULT_CONFIG, enabled: true });
    interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');

    const stats = interceptor.getStats();
    expect(stats.blockCount).toBe(2);
    expect(stats.requestCount).toBe(3);
  });

  it('CSS injector activates and deactivates cleanly', async () => {
    const mockTarget = {
      insertCSS: async () => 'test-key',
      removeCSS: async () => undefined,
    };

    await cssInjector.activate(mockTarget);
    expect(cssInjector.isActive()).toBe(true);
    expect(cssInjector.getInjectedSurfaces().length).toBeGreaterThan(0);

    await cssInjector.deactivate(mockTarget);
    expect(cssInjector.isActive()).toBe(false);
    expect(cssInjector.getInjectedSurfaces().length).toBe(0);
  });

  it('full lifecycle: activate, intercept, deactivate', () => {
    interceptor.activate();
    expect(interceptor.isActive()).toBe(true);

    interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    const stats = interceptor.getStats();
    expect(stats.blockCount).toBe(1);

    interceptor.deactivate();
    expect(interceptor.isActive()).toBe(false);
  });
});
