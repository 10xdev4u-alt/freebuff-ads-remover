/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { AdInterceptor } from '../src/interceptor.js';
import { CssInjector } from '../src/css-injector.js';
import { ElectronHook } from '../src/electron-hook.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { Config } from '../src/config.js';

const AD_URL = 'https://freebuff.com/api/ad/break';
const TRACKING = 'https://freebuff.com/api/ad/impression';

function interceptor(patch: Partial<Config> = {}) {
  return new AdInterceptor({ ...DEFAULT_CONFIG, ...patch }, new Logger('error', false));
}

function makeWebRequest() {
  const listeners: Record<string, Array<(...args: any[]) => any>> = {
    beforeRequest: [], headersReceived: [], beforeRedirect: [], completed: [], errorOccurred: [],
  };
  return {
    onBeforeRequest: vi.fn((_filter: unknown, l?: (...args: any[]) => any) => { if (l) listeners.beforeRequest?.push(l); }),
    onHeadersReceived: vi.fn((l: (...args: any[]) => any) => { listeners.headersReceived?.push(l); }),
    onBeforeRedirect: vi.fn((l: (...args: any[]) => any) => { listeners.beforeRedirect?.push(l); }),
    onCompleted: vi.fn((l: (...args: any[]) => any) => { listeners.completed?.push(l); }),
    onErrorOccurred: vi.fn((l: (...args: any[]) => any) => { listeners.errorOccurred?.push(l); }),
    listeners,
  };
}

describe('isAdUrl mirrors interceptor config gates', () => {
  it('is false for pattern, host and updates rules when disabled', () => {
    const i = interceptor({ enabled: false, blockUpdates: true, adHosts: ['ads.example.com'] });
    expect(i.intercept(AD_URL, 'GET').blocked).toBe(false);
    expect(i.isAdUrl(AD_URL)).toBe(false);
    expect(i.isAdUrl('https://freebuff.com/api/v1/ads/impression')).toBe(false);
    expect(i.isAdUrl('https://ads.example.com/pixel.gif')).toBe(false);
    expect(i.isAdUrl('https://freebuff.com/api/desktop/updates')).toBe(false);
  });

  it('updateConfig(false) retroactively clears isAdUrl', () => {
    const i = interceptor();
    expect(i.isAdUrl(AD_URL)).toBe(true);
    i.updateConfig({ ...DEFAULT_CONFIG, enabled: false });
    expect(i.isAdUrl(AD_URL)).toBe(false);
  });

  it('allows tracking endpoints but keeps ad content blocked when blockTracking is off', () => {
    const i = interceptor({ blockTracking: false });
    for (const url of [
      '/api/ad/impression', '/api/ad/click-return', '/api/ad/break-event',
      '/api/v1/ads/impression', '/api/v1/ads/invitation/event',
    ]) {
      expect(i.isAdUrl(url), url).toBe(false);
    }
    expect(i.isAdUrl(AD_URL)).toBe(true);
  });

  it('agrees with intercept across the gate matrix', () => {
    const configs: Partial<Config>[] = [{}, { enabled: false }, { blockTracking: false }, { enabled: false, blockTracking: false }];
    for (const patch of configs) {
      const i = interceptor(patch);
      for (const url of [AD_URL, TRACKING, 'https://freebuff.com/api/chat']) {
        expect(i.isAdUrl(url), `${JSON.stringify(patch)} ${url}`).toBe(i.intercept(url, 'GET').blocked);
      }
    }
  });

  it('does not cancel a legitimate hop after an allowed tracking redirect', () => {
    const config = { ...DEFAULT_CONFIG, blockTracking: false };
    const logger = new Logger('error', false);
    const i = new AdInterceptor(config, logger);
    const webRequest = makeWebRequest();
    const hook = new ElectronHook(i, new CssInjector(config, logger), logger, undefined, false, config);
    hook.activate({ defaultSession: { webRequest } });
    expect(i.intercept(TRACKING, 'GET').blocked).toBe(false);

    const before = webRequest.listeners.beforeRequest ?? [];
    const redirects = webRequest.listeners.beforeRedirect ?? [];
    const first = vi.fn();
    before[0]?.({ id: 42, url: 'https://freebuff.com/start', method: 'GET' }, first);
    expect(first).toHaveBeenCalledWith({});

    redirects[0]?.({ id: 42, redirectURL: TRACKING });

    const second = vi.fn();
    before[0]?.({ id: 42, url: 'https://freebuff.com/landing', method: 'GET' }, second);
    expect(second).toHaveBeenCalledWith({});
  });

  it('does not cancel a 3xx Location to a tracking URL when blockTracking is off', () => {
    const config = { ...DEFAULT_CONFIG, blockTracking: false };
    const logger = new Logger('error', false);
    const i = new AdInterceptor(config, logger);
    const webRequest = makeWebRequest();
    const hook = new ElectronHook(i, new CssInjector(config, logger), logger, undefined, false, config);
    hook.activate({ defaultSession: { webRequest } });

    const headers = webRequest.listeners.headersReceived ?? [];
    const callback = vi.fn();
    headers[0]?.({
      statusCode: 302,
      url: 'https://freebuff.com/start',
      responseHeaders: { location: [TRACKING] },
    }, callback);
    expect(callback).toHaveBeenCalledWith({});
  });
});
