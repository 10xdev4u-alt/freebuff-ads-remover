/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { AdInterceptor } from '../src/interceptor.js';
import { CssInjector } from '../src/css-injector.js';
import { ElectronHook } from '../src/electron-hook.js';
import { Logger } from '../src/logger.js';
import { ShadowCapture } from '../src/shadow-capture.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { Config } from '../src/config.js';

const AD_URL = 'https://freebuff.com/api/ad/break';

function shadow(dryRun: boolean) {
  return new ShadowCapture({ enabled: true, dryRun, sampleRate: 1, captureDir: '' });
}

function interceptor(patch: Partial<Config> = {}, dryRun = false) {
  return new AdInterceptor(
    { ...DEFAULT_CONFIG, ...patch },
    new Logger('error', false),
    undefined,
    shadow(dryRun),
  );
}

interface Listeners {
  beforeRequest: Array<(...args: any[]) => any>;
  headersReceived: Array<(...args: any[]) => any>;
  beforeRedirect: Array<(...args: any[]) => any>;
  completed: Array<(...args: any[]) => any>;
  errorOccurred: Array<(...args: any[]) => any>;
}

function hook(i: AdInterceptor, config: Config): Listeners {
  const listeners: Listeners = {
    beforeRequest: [], headersReceived: [], beforeRedirect: [], completed: [], errorOccurred: [],
  };
  const webRequest = {
    onBeforeRequest: vi.fn((_f: unknown, l?: (...args: any[]) => any) => { if (l) listeners.beforeRequest.push(l); }),
    onHeadersReceived: vi.fn((l: (...args: any[]) => any) => { listeners.headersReceived.push(l); }),
    onBeforeRedirect: vi.fn((l: (...args: any[]) => any) => { listeners.beforeRedirect.push(l); }),
    onCompleted: vi.fn(),
    onErrorOccurred: vi.fn(),
  };
  const logger = new Logger('error', false);
  const h = new ElectronHook(i, new CssInjector(config, logger), logger, undefined, false, config);
  h.activate({ defaultSession: { webRequest } });
  return listeners;
}

describe('isAdUrl respects shadow dryRun', () => {
  it('is false for pattern, host and updates rules when dryRun is on', () => {
    const i = interceptor({ adHosts: ['ads.example.com'], blockUpdates: true }, true);
    expect(i.intercept(AD_URL, 'GET').blocked).toBe(false);
    expect(i.isAdUrl(AD_URL)).toBe(false);
    expect(i.isAdUrl('https://ads.example.com/pixel.gif')).toBe(false);
    expect(i.isAdUrl('https://freebuff.com/api/desktop/updates')).toBe(false);
  });

  it('agrees with intercept across the dryRun gate matrix', () => {
    for (const dryRun of [true, false]) {
      for (const patch of [
        {}, { enabled: false }, { blockTracking: false },
        { blockUpdates: true }, { adHosts: ['ads.example.com'] },
      ]) {
        const i = interceptor(patch, dryRun);
        for (const url of [AD_URL, 'https://freebuff.com/api/ad/impression', 'https://freebuff.com/api/chat']) {
          expect(i.isAdUrl(url), `${String(dryRun)} ${JSON.stringify(patch)} ${url}`).toBe(i.intercept(url, 'GET').blocked);
        }
      }
    }
  });

  it('flips immediately when updateConfig changes dryRun', () => {
    const i = interceptor({}, false);
    expect(i.isAdUrl(AD_URL)).toBe(true);
    i.updateConfig({ ...DEFAULT_CONFIG, shadow: { ...DEFAULT_CONFIG.shadow, enabled: true, dryRun: true } });
    expect(i.isAdUrl(AD_URL)).toBe(false);
  });

  it('does not cancel a redirect chain when dryRun is on', () => {
    const config = { ...DEFAULT_CONFIG, shadow: { ...DEFAULT_CONFIG.shadow, enabled: true, dryRun: true } };
    const i = new AdInterceptor(config, new Logger('error', false), undefined, shadow(true));
    const listeners = hook(i, config);
    const first = vi.fn();
    listeners.beforeRequest[0]?.({ id: 7, url: 'https://freebuff.com/start', method: 'GET' }, first);
    expect(first).toHaveBeenCalledWith({});
    listeners.beforeRedirect[0]?.({ id: 7, redirectURL: AD_URL });
    const second = vi.fn();
    listeners.beforeRequest[0]?.({ id: 7, url: 'https://freebuff.com/landing', method: 'GET' }, second);
    expect(second).toHaveBeenCalledWith({});
  });

  it('does not cancel a 3xx Location to an ad URL when dryRun is on', () => {
    const config = { ...DEFAULT_CONFIG, shadow: { ...DEFAULT_CONFIG.shadow, enabled: true, dryRun: true } };
    const i = new AdInterceptor(config, new Logger('error', false), undefined, shadow(true));
    const listeners = hook(i, config);
    const callback = vi.fn();
    listeners.headersReceived[0]?.({
      statusCode: 302,
      url: 'https://freebuff.com/start',
      responseHeaders: { location: [AD_URL] },
    }, callback);
    expect(callback).toHaveBeenCalledWith({});
  });

  it('does not cancel a lowercase or capitalized Location 3xx under dryRun', () => {
    const config = { ...DEFAULT_CONFIG, shadow: { ...DEFAULT_CONFIG.shadow, enabled: true, dryRun: true } };
    const i = new AdInterceptor(config, new Logger('error', false), undefined, shadow(true));
    const listeners = hook(i, config);

    const lower = vi.fn();
    listeners.headersReceived[0]?.({
      statusCode: 302,
      url: 'https://freebuff.com/start',
      responseHeaders: { location: [AD_URL] },
    }, lower);
    expect(lower).toHaveBeenCalledWith({});

    const upper = vi.fn();
    listeners.headersReceived[0]?.({
      statusCode: 301,
      url: 'https://freebuff.com/start',
      responseHeaders: { Location: ['/api/ad/break'] },
    }, upper);
    expect(upper).toHaveBeenCalledWith({});
  });

  it('still blocks and records when dryRun is off', () => {
    const capture = shadow(false);
    const record = vi.spyOn(capture, 'record');
    const i = new AdInterceptor(DEFAULT_CONFIG, new Logger('error', false), undefined, capture);
    expect(i.intercept(AD_URL, 'GET').blocked).toBe(true);
    expect(i.isAdUrl(AD_URL)).toBe(true);
    expect(record).toHaveBeenCalled();
    expect(record.mock.calls[0]?.[0]).toMatchObject({ decision: { blocked: true } });
  });

  it('still cancels redirects when dryRun is off', () => {
    const config = DEFAULT_CONFIG;
    const i = new AdInterceptor(config, new Logger('error', false));
    const listeners = hook(i, config);
    const callback = vi.fn();
    listeners.headersReceived[0]?.({
      statusCode: 302,
      url: 'https://freebuff.com/start',
      responseHeaders: { location: [AD_URL] },
    }, callback);
    expect(callback).toHaveBeenCalledWith({ cancel: true });
  });
});
