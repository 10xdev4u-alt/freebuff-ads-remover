/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ElectronHook } from '../src/electron-hook.js';
import { AdInterceptor } from '../src/interceptor.js';
import { CssInjector } from '../src/css-injector.js';
import { WebContentsScriptTarget } from '../src/web-contents-script.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { Logger } from '../src/logger.js';

type Listener = (...args: any[]) => any;

interface WebRequestListeners {
  beforeRequest: Listener[];
  headersReceived: Listener[];
  beforeRedirect: Listener[];
  completed: Listener[];
  errorOccurred: Listener[];
}

function makeWebRequest() {
  const listeners: WebRequestListeners = {
    beforeRequest: [],
    headersReceived: [],
    beforeRedirect: [],
    completed: [],
    errorOccurred: [],
  };
  return {
    onBeforeRequest: vi.fn((_filter: unknown, l?: Listener) => { if (l) listeners.beforeRequest.push(l); }),
    onHeadersReceived: vi.fn((l: Listener) => { listeners.headersReceived.push(l); }),
    onBeforeRedirect: vi.fn((l: Listener) => { listeners.beforeRedirect.push(l); }),
    onCompleted: vi.fn((l: Listener) => { listeners.completed.push(l); }),
    onErrorOccurred: vi.fn((l: Listener) => { listeners.errorOccurred.push(l); }),
    listeners,
  };
}

function makeSession(webRequest: unknown = makeWebRequest()) {
  return { webRequest };
}

function makeApp(opts: { userData?: string; getPathThrows?: boolean } = {}) {
  const listeners = new Map<string, Listener[]>();
  return {
    whenReady: () => Promise.resolve(),
    on: vi.fn((event: string, l: Listener) => {
      const existing = listeners.get(event) ?? [];
      existing.push(l);
      listeners.set(event, existing);
    }),
    removeListener: vi.fn(),
    emit: (event: string, ...args: unknown[]) => {
      for (const l of listeners.get(event) ?? []) l(...args);
    },
    getPath: opts.getPathThrows
      ? () => { throw new Error('nope'); }
      : () => opts.userData,
  };
}

interface HookInternals {
  hookContentsSession: (contents: unknown) => void;
}

function internals(hook: ElectronHook): HookInternals {
  return hook as unknown as HookInternals;
}

describe('ElectronHook extra', () => {
  let logger: Logger;
  let interceptor: AdInterceptor;
  let cssInjector: CssInjector;

  beforeEach(() => {
    logger = new Logger('error', false);
    interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);
    cssInjector = new CssInjector(DEFAULT_CONFIG, logger);
  });

  afterEach(() => vi.restoreAllMocks());

  it('deactivate is a no-op when never activated', () => {
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    hook.deactivate();
    expect(hook.isActive()).toBe(false);
  });

  it('re-arms an already-hooked session instead of bailing out', () => {
    const webRequest = makeWebRequest();
    const session = makeSession(webRequest);
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    const app = makeApp();
    hook.activate({ defaultSession: session }, { app, webContents: { getAllWebContents: () => [] } });

    const before = webRequest.onBeforeRequest.mock.calls.length;
    app.emit('session-created', {}, session);
    expect(webRequest.onBeforeRequest.mock.calls.length).toBeGreaterThan(before);
    expect(hook.getSessionCount()).toBe(1);
  });

  it('ignores non-object webContents and contents without a session', () => {
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    const app = makeApp();
    hook.activate({ defaultSession: makeSession() }, { app, webContents: { getAllWebContents: () => [] } });

    expect(() => { app.emit('web-contents-created', {}, null); }).not.toThrow();
    expect(() => { app.emit('web-contents-created', {}, 'not-an-object'); }).not.toThrow();
    expect(() => { app.emit('web-contents-created', {}, { on: vi.fn() }); }).not.toThrow();
    expect(hook.getSessionCount()).toBe(1);

    // Directly exercise the private guard for contents without a usable `on`.
    expect(() => { internals(hook).hookContentsSession({}); }).not.toThrow();
    expect(() => { internals(hook).hookContentsSession({ session: undefined }); }).not.toThrow();
  });

  it('re-hooks the contents session after did-finish-load', () => {
    const webRequest = makeWebRequest();
    const session = makeSession(webRequest);
    const finishListeners: Listener[] = [];
    const contents = {
      session,
      on: vi.fn((event: string, l: Listener) => { if (event === 'did-finish-load') finishListeners.push(l); }),
    };
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    const app = makeApp();
    hook.activate({ defaultSession: makeSession() }, { app, webContents: { getAllWebContents: () => [contents] } });

    const before = webRequest.onBeforeRequest.mock.calls.length;
    finishListeners[0]?.();
    expect(webRequest.onBeforeRequest.mock.calls.length).toBeGreaterThan(before);
  });

  it('cancels a request whose redirect chain was already flagged as ad', () => {
    const webRequest = makeWebRequest();
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    hook.activate({ defaultSession: makeSession(webRequest) });

    const requestListener = webRequest.listeners.beforeRequest[0]!;
    const redirectListener = webRequest.listeners.beforeRedirect[0]!;
    const completedListener = webRequest.listeners.completed[0]!;
    const errorListener = webRequest.listeners.errorOccurred[0]!;
    expect(requestListener).toBeTypeOf('function');
    expect(redirectListener).toBeTypeOf('function');

    redirectListener({ id: 7, redirectURL: 'https://freebuff.com/api/v1/ads/impression' });
    const callback = vi.fn();
    requestListener({ id: 7, url: 'https://freebuff.com/api/ad/break', method: 'GET' }, callback);
    expect(callback).toHaveBeenCalledWith({ cancel: true });

    completedListener({ id: 7 });
    errorListener({ id: 7 });
    // After completion the chain is forgotten, so the same id is judged on its URL.
    const callback2 = vi.fn();
    requestListener({ id: 7, url: 'https://freebuff.com/api/ad/break', method: 'GET' }, callback2);
    expect(callback2).toHaveBeenCalledWith({ cancel: true });
  });

  it('cancels a 3xx redirect to an ad URL and allows other responses', () => {
    const webRequest = makeWebRequest();
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    hook.activate({ defaultSession: makeSession(webRequest) });

    const headers = webRequest.listeners.headersReceived[0]!;
    expect(headers).toBeTypeOf('function');

    const adCallback = vi.fn();
    headers({ statusCode: 302, url: 'https://freebuff.com/start', responseHeaders: { location: ['https://ads.example.com/api/ad/break'] } }, adCallback);
    expect(adCallback).toHaveBeenCalledWith({ cancel: true });

    const relativeCallback = vi.fn();
    headers({ statusCode: 301, url: 'https://freebuff.com/start', responseHeaders: { Location: ['/api/v1/ads/impression'] } }, relativeCallback);
    expect(relativeCallback).toHaveBeenCalledWith({ cancel: true });

    const okCallback = vi.fn();
    headers({ statusCode: 200, url: 'https://freebuff.com/x', responseHeaders: {} }, okCallback);
    expect(okCallback).toHaveBeenCalledWith({});

    const safeCallback = vi.fn();
    headers({ statusCode: 302, url: 'https://freebuff.com/start', responseHeaders: { location: ['https://freebuff.com/landing'] } }, safeCallback);
    expect(safeCallback).toHaveBeenCalledWith({});
  });

  it('skips header rewriting when onHeadersReceived is absent', () => {
    const webRequest = { onBeforeRequest: vi.fn() };
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    expect(() => { hook.activate({ defaultSession: makeSession(webRequest) }); }).not.toThrow();
    expect(webRequest.onBeforeRequest).toHaveBeenCalled();
  });

  it('discovers and hooks persisted partitions', () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-userdata-'));
    fs.mkdirSync(path.join(userData, 'Partitions', 'freebuff-hosted-v1-abc'), { recursive: true });
    fs.mkdirSync(path.join(userData, 'Partitions', 'Other'), { recursive: true });

    const partitionRequest = makeWebRequest();
    const sessionModule = {
      defaultSession: makeSession(),
      fromPartition: vi.fn(() => makeSession(partitionRequest)),
    };
    const app = makeApp({ userData });
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    hook.activate(sessionModule, { app, webContents: { getAllWebContents: () => [] } });

    expect(sessionModule.fromPartition).toHaveBeenCalledWith('persist:freebuff-hosted-v1-abc');
    expect(partitionRequest.onBeforeRequest).toHaveBeenCalled();
    expect(hook.getSessionCount()).toBe(2);
  });

  it('tolerates a missing userData path, a throwing getPath and a throwing fromPartition', () => {
    const sessionModule = {
      defaultSession: makeSession(),
      fromPartition: vi.fn(() => { throw new Error('nope'); }),
    };
    const app = makeApp();
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    expect(() => { hook.activate(sessionModule, { app, webContents: { getAllWebContents: () => [] } }); }).not.toThrow();

    const throwingApp = makeApp({ getPathThrows: true });
    expect(() => { hook.activate({ defaultSession: makeSession() }, { app: throwingApp, webContents: { getAllWebContents: () => [] } }); }).not.toThrow();
  });

  it('injects the DOM remover script when domRemoval is enabled', () => {
    const inject = vi.spyOn(WebContentsScriptTarget.prototype, 'injectScript').mockImplementation(() => '');
    const hook = new ElectronHook(interceptor, cssInjector, logger, undefined, true);
    const app = makeApp();
    hook.activate({ defaultSession: makeSession() }, { app, webContents: { getAllWebContents: () => [] } });
    expect(inject).toHaveBeenCalled();
    hook.deactivate();
  });

  it('deactivates cleanly with the app API and clears listeners', () => {
    const webRequest = makeWebRequest();
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    const app = makeApp();
    hook.activate({ defaultSession: makeSession(webRequest) }, { app, webContents: { getAllWebContents: () => [] } });
    hook.deactivate();
    expect(webRequest.onBeforeRequest).toHaveBeenCalledWith(null, null);
    expect(app.removeListener).toHaveBeenCalledWith('web-contents-created', expect.any(Function));
    expect(app.removeListener).toHaveBeenCalledWith('session-created', expect.any(Function));
    expect(hook.getSessionCount()).toBe(0);
  });

  it('warns but does not throw when a session will not remove its hook', () => {
    const webRequest = {
      onBeforeRequest: vi.fn((_filter: unknown) => {
        if (_filter === null) throw new Error('nope');
      }),
    };
    const hook = new ElectronHook(interceptor, cssInjector, logger);
    hook.activate({ defaultSession: makeSession(webRequest) });
    expect(() => { hook.deactivate(); }).not.toThrow();
    expect(hook.isActive()).toBe(false);
  });
});
