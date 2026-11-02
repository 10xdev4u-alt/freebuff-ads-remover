import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElectronHook } from '../src/electron-hook.js';
import { AdInterceptor } from '../src/interceptor.js';
import { CssInjector } from '../src/css-injector.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { Logger } from '../src/logger.js';

const flushAsync = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

function makeContents(session: unknown): {
  session: unknown;
  getType: () => string;
  getURL: () => string;
  isDestroyed: () => boolean;
  insertCSS: () => Promise<string>;
  removeInsertedCSS: () => Promise<void>;
  on: () => void;
} {
  return {
    session,
    getType: () => 'window',
    getURL: () => 'http://127.0.0.1:5174/',
    isDestroyed: () => false,
    insertCSS: () => Promise.resolve('key'),
    removeInsertedCSS: () => Promise.resolve(),
    on: () => undefined,
  };
}

function makeApp(): {
  whenReady: () => Promise<void>;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
} {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    whenReady: () => Promise.resolve(),
    on: (event, listener) => {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
    },
    removeListener: (event, listener) => {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, existing.filter((l) => l !== listener));
    },
    emit: (event, ...args) => {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
  };
}

describe('ElectronHook', () => {
  let hook: ElectronHook;
  let interceptor: AdInterceptor;
  let cssInjector: CssInjector;
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('error', false);
    interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);
    cssInjector = new CssInjector(DEFAULT_CONFIG, logger);
    hook = new ElectronHook(interceptor, cssInjector, logger);
  });

  it('activates with session', () => {
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: vi.fn(),
        },
      },
    };

    hook.activate(mockSession);
    expect(hook.isActive()).toBe(true);
    expect(mockSession.defaultSession.webRequest.onBeforeRequest).toHaveBeenCalled();
  });

  it('deactivates cleanly', () => {
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: vi.fn(),
        },
      },
    };

    hook.activate(mockSession);
    hook.deactivate();
    expect(hook.isActive()).toBe(false);
  });

  it('does not activate twice', () => {
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: vi.fn(),
        },
      },
    };

    hook.activate(mockSession);
    hook.activate(mockSession);
    expect(mockSession.defaultSession.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1);
  });

  it('blocks ad requests through session hook', () => {
    const onBeforeRequestMock = vi.fn();
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: onBeforeRequestMock,
        },
      },
    };

    hook.activate(mockSession);
    expect(onBeforeRequestMock).toHaveBeenCalled();
  });

  it('enables the CSS fallback when the Electron app API is available', async () => {
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: vi.fn(),
        },
      },
    };
    const mockApp = {
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    hook.activate(mockSession, { app: mockApp, webContents: { getAllWebContents: () => [] } });
    await flushAsync();
    expect(hook.isActive()).toBe(true);
    expect(cssInjector.getInjectedSurfaces()).toContain('all');
    expect(mockApp.on).toHaveBeenCalledWith('web-contents-created', expect.any(Function));
  });

  it('skips the CSS fallback without the Electron app API', () => {
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: vi.fn(),
        },
      },
    };

    hook.activate(mockSession);
    expect(hook.isActive()).toBe(true);
    expect(cssInjector.getInjectedSurfaces()).toHaveLength(0);
  });

  it('refuses to activate against a session without webRequest', () => {
    hook.activate({ defaultSession: {} });
    expect(hook.isActive()).toBe(false);

    hook.activate(undefined);
    expect(hook.isActive()).toBe(false);
  });

  it('cleans up the CSS fallback on deactivate', () => {
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: vi.fn(),
        },
      },
    };
    const mockApp = {
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    hook.activate(mockSession, { app: mockApp });
    hook.deactivate();
    expect(hook.isActive()).toBe(false);
    expect(mockApp.removeListener).toHaveBeenCalledWith('web-contents-created', expect.any(Function));
    expect(mockSession.defaultSession.webRequest.onBeforeRequest).toHaveBeenCalledWith(null, null);
  });

  it('activates and deactivates the dashboard with the app API', () => {
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: vi.fn(),
        },
      },
    };
    const mockApp = {
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const dashboard = { activate: vi.fn(), deactivate: vi.fn() };
    const hooked = new ElectronHook(
      interceptor,
      cssInjector,
      logger,
      dashboard as unknown as ConstructorParameters<typeof ElectronHook>[3],
    );

    hooked.activate(mockSession, { app: mockApp, webContents: { getAllWebContents: () => [] } });
    expect(dashboard.activate).toHaveBeenCalledWith(mockApp, expect.any(Function));

    hooked.deactivate();
    expect(dashboard.deactivate).toHaveBeenCalled();
  });

  it('hooks the hosted-workspace session exposed by a webContents', () => {
    const mockSession = {
      defaultSession: { webRequest: { onBeforeRequest: vi.fn() } },
    };
    const hostedRequest = { onBeforeRequest: vi.fn() };
    const hostedContents = makeContents({ webRequest: hostedRequest });
    const app = {
      whenReady: () => Promise.resolve(),
      on: vi.fn(),
      removeListener: vi.fn(),
    };

    hook.activate(mockSession, {
      app,
      webContents: { getAllWebContents: () => [hostedContents] },
    });

    expect(hostedRequest.onBeforeRequest).toHaveBeenCalledWith(
      { urls: ['*://*/*'] },
      expect.any(Function),
    );
    expect(hook.getSessionCount()).toBe(2);
  });

  it('hooks sessions created after activation', () => {
    const mockSession = {
      defaultSession: { webRequest: { onBeforeRequest: vi.fn() } },
    };
    const app = makeApp();
    hook.activate(mockSession, { app, webContents: { getAllWebContents: () => [] } });

    const lateRequest = { onBeforeRequest: vi.fn() };
    app.emit('session-created', {}, { webRequest: lateRequest });

    expect(lateRequest.onBeforeRequest).toHaveBeenCalled();
    expect(hook.getSessionCount()).toBe(2);
  });

  it('hooks a partition session from a late webContents and blocks there', () => {
    const mockSession = {
      defaultSession: { webRequest: { onBeforeRequest: vi.fn() } },
    };
    const app = makeApp();
    hook.activate(mockSession, { app, webContents: { getAllWebContents: () => [] } });

    const lateRequest = { onBeforeRequest: vi.fn() };
    app.emit('web-contents-created', {}, makeContents({ webRequest: lateRequest }));

    const listener = lateRequest.onBeforeRequest.mock.calls[0]?.[1] as (
      details: { url: string; method: string },
      callback: (response: { cancel?: boolean }) => void,
    ) => void;
    const callback = vi.fn();
    listener({ url: 'https://freebuff.com/api/v1/ads/impression', method: 'POST' }, callback);
    expect(callback).toHaveBeenCalledWith({ cancel: true });

    hook.deactivate();
    expect(lateRequest.onBeforeRequest).toHaveBeenCalledWith(null, null);
    expect(hook.getSessionCount()).toBe(0);
  });

  it('leaves the dashboard untouched without the app API', () => {
    const dashboard = { activate: vi.fn(), deactivate: vi.fn() };
    const hooked = new ElectronHook(
      interceptor,
      cssInjector,
      logger,
      dashboard as unknown as ConstructorParameters<typeof ElectronHook>[3],
    );
    const mockSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: vi.fn(),
        },
      },
    };

    hooked.activate(mockSession);
    expect(dashboard.activate).not.toHaveBeenCalled();
  });
});
