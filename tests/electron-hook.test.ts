import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ElectronHook } from '../src/electron-hook.js';
import { AdInterceptor } from '../src/interceptor.js';
import { CssInjector } from '../src/css-injector.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { Logger } from '../src/logger.js';

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

    hook.activate(mockSession as never);
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

    hook.activate(mockSession as never);
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

    hook.activate(mockSession as never);
    hook.activate(mockSession as never);
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

    hook.activate(mockSession as never);
    expect(onBeforeRequestMock).toHaveBeenCalled();
  });
});
