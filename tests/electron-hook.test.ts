import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElectronHook } from '../src/electron-hook.js';
import { AdInterceptor } from '../src/interceptor.js';
import { CssInjector } from '../src/css-injector.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { Logger } from '../src/logger.js';

const flushAsync = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

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
