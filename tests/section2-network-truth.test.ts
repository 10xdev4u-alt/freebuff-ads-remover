/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ElectronHook } from '../src/electron-hook.js';
import { AdInterceptor } from '../src/interceptor.js';
import { CssInjector } from '../src/css-injector.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { discoverPartitions } from '../src/partition-scanner.js';

type Listener = (...args: any[]) => any;

function makeWebRequest() {
  const listeners: Record<string, Listener[]> = { beforeRequest: [], headersReceived: [], beforeRedirect: [], completed: [], errorOccurred: [] };
  return {
    onBeforeRequest: vi.fn((_filter: unknown, l?: Listener) => { if (l) listeners.beforeRequest?.push(l); }),
    onHeadersReceived: vi.fn((l: Listener) => { listeners.headersReceived?.push(l); }),
    onBeforeRedirect: vi.fn((l: Listener) => { listeners.beforeRedirect?.push(l); }),
    onCompleted: vi.fn((l: Listener) => { listeners.completed?.push(l); }),
    onErrorOccurred: vi.fn((l: Listener) => { listeners.errorOccurred?.push(l); }),
    listeners,
  };
}

function makeApp(userData?: string) {
  const events = new Map<string, Listener[]>();
  return {
    whenReady: () => Promise.resolve(),
    on: vi.fn((event: string, l: Listener) => {
      events.set(event, [...(events.get(event) ?? []), l]);
    }),
    removeListener: vi.fn(),
    emit: (event: string, ...args: unknown[]) => {
      for (const l of events.get(event) ?? []) l(...args);
    },
    getPath: vi.fn(() => userData),
  };
}

function hookFor(overrides: Record<string, unknown> = {}) {
  const logger = new Logger('error', false);
  const interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);
  const spy = vi.spyOn(interceptor, 'intercept');
  const hook = new ElectronHook(interceptor, new CssInjector(DEFAULT_CONFIG, logger), logger);
  const app = makeApp(typeof overrides.userData === 'string' ? overrides.userData : '');
  const defaultRequest = makeWebRequest();
  hook.activate(
    { defaultSession: { webRequest: defaultRequest } },
    { app, webContents: { getAllWebContents: () => [] } },
  );
  return { hook, app, defaultRequest, interceptor, spy };
}

const AD_URL = 'https://freebuff.com/api/ad/break';
const CONTROL_URL = 'https://freebuff.com/landing';

function fire(request: ReturnType<typeof makeWebRequest>, details: Record<string, unknown>, id = 1) {
  const callback = vi.fn();
  const listener = (request.listeners.beforeRequest ?? [])[0];
  if (!listener) throw new Error('no beforeRequest listener');
  listener({ id, ...details }, callback);
  return callback;
}

describe('section 2 network truth through the session hook', () => {
  it('wildcard listener cancels EventSource-style GETs and records a POST method', () => {
    const { hook, defaultRequest, interceptor, spy } = hookFor();
    expect(defaultRequest.onBeforeRequest).toHaveBeenCalledWith({ urls: ['*://*/*'] }, expect.any(Function));
    expect(fire(defaultRequest, { url: AD_URL, method: 'GET' }, 1)).toHaveBeenCalledWith({ cancel: true });
    expect(fire(defaultRequest, { url: AD_URL, method: 'POST' }, 2)).toHaveBeenCalledWith({ cancel: true });
    expect(spy).toHaveBeenCalledWith(AD_URL, 'POST');
    expect(fire(defaultRequest, { url: AD_URL }, 3)).toHaveBeenCalledWith({ cancel: true });
    expect(spy).toHaveBeenCalledWith(AD_URL, 'GET');
    expect(interceptor.isAdUrl(AD_URL)).toBe(true);
    expect(hook.getSessionCount()).toBe(1);
  });

  it('allows non-ad GET and POST requests', () => {
    const { defaultRequest } = hookFor();
    expect(fire(defaultRequest, { url: CONTROL_URL, method: 'GET' })).toHaveBeenCalledWith({});
    expect(fire(defaultRequest, { url: CONTROL_URL, method: 'POST' })).toHaveBeenCalledWith({});
  });

  it('hooks a session-created worker session and cancels its ad fetch', () => {
    const { hook, app } = hookFor();
    const worker = makeWebRequest();
    app.emit('session-created', {}, { webRequest: worker });
    expect(worker.onBeforeRequest).toHaveBeenCalledWith({ urls: ['*://*/*'] }, expect.any(Function));
    expect(hook.getSessionCount()).toBe(2);
    expect(fire(worker, { url: AD_URL, method: 'GET' })).toHaveBeenCalledWith({ cancel: true });
  });

  it('hooks a webview guest session and re-arms it on did-finish-load', () => {
    const { hook, app } = hookFor();
    const guest = makeWebRequest();
    const guestEvents = new Map<string, Listener[]>();
    const contents = {
      session: { webRequest: guest },
      isDestroyed: () => false,
      getURL: () => 'https://freebuff.com/',
      getType: () => 'renderer',
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
      on: (event: string, l: Listener) => {
        guestEvents.set(event, [...(guestEvents.get(event) ?? []), l]);
      },
    };
    app.emit('web-contents-created', {}, contents);
    expect(guest.onBeforeRequest).toHaveBeenCalledWith({ urls: ['*://*/*'] }, expect.any(Function));
    expect(hook.getSessionCount()).toBe(2);
    expect(fire(guest, { url: AD_URL })).toHaveBeenCalledWith({ cancel: true });
    const before = guest.onBeforeRequest.mock.calls.length;
    for (const l of guestEvents.get('did-finish-load') ?? []) l();
    expect(guest.onBeforeRequest.mock.calls.length).toBeGreaterThan(before);
  });

  it.each([
    `${AD_URL}?placement=home`,
    '/api/ad/break?placement=home',
    'https://freebuff.com/API//AD/Break?Placement=HOME',
    '/API//AD/Break?Placement=HOME',
    'https://freebuff.com/api/ad/break/',
  ])('blocks URL variant %s from the wildcard listener', (url) => {
    const { defaultRequest } = hookFor();
    expect(fire(defaultRequest, { url, method: 'GET' })).toHaveBeenCalledWith({ cancel: true });
  });

  it('does not let an ad token in a query value block a control request', () => {
    const { defaultRequest } = hookFor();
    expect(fire(defaultRequest, { url: `${CONTROL_URL}?next=/api/ad/break`, method: 'GET' })).toHaveBeenCalledWith({});
  });

  it('blocks URL variants from a discovered partition session', () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-partition-truth-'));
    try {
      fs.mkdirSync(path.join(userData, 'Partitions', 'freebuff-hosted-v1-abc'), { recursive: true });
      const partition = makeWebRequest();
      const logger = new Logger('error', false);
      const hook = new ElectronHook(
        new AdInterceptor(DEFAULT_CONFIG, logger), new CssInjector(DEFAULT_CONFIG, logger), logger,
      );
      const app = makeApp(userData);
      hook.activate(
        {
          defaultSession: { webRequest: makeWebRequest() },
          fromPartition: vi.fn(() => ({ webRequest: partition })),
        },
        { app, webContents: { getAllWebContents: () => [] } },
      );
      for (const url of [`${AD_URL}?placement=home`, 'https://freebuff.com/API//AD/Break?Placement=HOME']) {
        expect(fire(partition, { url, method: 'GET' }), url).toHaveBeenCalledWith({ cancel: true });
      }
      expect(hook.getSessionCount()).toBe(2);
    } finally {
      fs.rmSync(userData, { recursive: true, force: true });
    }
  });

  it('discovers query-like and alternate partition names with regex patterns', () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-partition-names-'));
    try {
      fs.mkdirSync(path.join(userData, 'Partitions', 'freebuff-hosted-v1?placement=home'), { recursive: true });
      fs.mkdirSync(path.join(userData, 'Partitions', 'hosted-v2-x'), { recursive: true });
      expect(discoverPartitions(userData, /^freebuff-/)).toContain('persist:freebuff-hosted-v1?placement=home');
      expect(discoverPartitions(userData, /^hosted-v2-/)).toContain('persist:hosted-v2-x');

      const alternate = makeWebRequest();
      const logger = new Logger('error', false);
      const config = { ...DEFAULT_CONFIG, network: { partitionPattern: '^hosted-v2-' } };
      const hook = new ElectronHook(
        new AdInterceptor(config, logger), new CssInjector(config, logger), logger,
        undefined, false, config,
      );
      const fromPartition = vi.fn(() => ({ webRequest: alternate }));
      hook.activate(
        { defaultSession: { webRequest: makeWebRequest() }, fromPartition },
        { app: makeApp(userData), webContents: { getAllWebContents: () => [] } },
      );
      expect(fromPartition).toHaveBeenCalledWith('persist:hosted-v2-x');
    } finally {
      fs.rmSync(userData, { recursive: true, force: true });
    }
  });
});
