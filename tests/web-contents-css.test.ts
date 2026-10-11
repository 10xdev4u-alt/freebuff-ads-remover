import { describe, it, expect, vi } from 'vitest';
import { WebContentsCssTarget } from '../src/web-contents-css.js';
import { Logger } from '../src/logger.js';
import type { ElectronAppLike } from '../src/electron-bridge.js';

const APP_URL = 'http://127.0.0.1:5174/';

interface MockWebContents {
  getType: () => string;
  getURL: () => string;
  isDestroyed: () => boolean;
  insertCSS: ReturnType<typeof vi.fn>;
  removeInsertedCSS: ReturnType<typeof vi.fn>;
  on: (event: string, listener: () => void) => void;
  emit: (event: string) => void;
  setUrl: (url: string) => void;
  destroy: () => void;
}

function makeWebContents(initialUrl = APP_URL, type = 'window'): MockWebContents {
  const listeners = new Map<string, Array<() => void>>();
  let url = initialUrl;
  let destroyed = false;
  let seq = 0;

  return {
    getType: () => type,
    getURL: () => url,
    isDestroyed: () => destroyed,
    insertCSS: vi.fn(() => {
      seq += 1;
      return Promise.resolve(`key-${String(seq)}`);
    }),
    removeInsertedCSS: vi.fn(() => Promise.resolve()),
    on: (event: string, listener: () => void) => {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
    },
    emit: (event: string) => {
      for (const listener of listeners.get(event) ?? []) listener();
    },
    setUrl: (next: string) => {
      url = next;
    },
    destroy: () => {
      destroyed = true;
    },
  };
}

interface MockApp extends ElectronAppLike {
  emit: (event: string, ...args: unknown[]) => void;
  listenerCount: (event: string) => number;
}

function makeApp(): MockApp {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    whenReady: () => Promise.resolve(),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
      return undefined;
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, existing.filter((l) => l !== listener));
      return undefined;
    },
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
    listenerCount: (event: string) => (listeners.get(event) ?? []).length,
  };
}

const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('WebContentsCssTarget', () => {
  it('injects a rule into existing app-origin webContents', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsCssTarget(app, () => [wc], logger);

    await target.insertCSS('.ad {}');
    await flush();

    expect(wc.insertCSS).toHaveBeenCalledWith('.ad {}');
    target.dispose();
  });

  it('ignores webContents on foreign origins (previewed sites)', async () => {
    const app = makeApp();
    const wc = makeWebContents('https://example.com/page');
    const logger = new Logger('error', false);
    const target = new WebContentsCssTarget(app, () => [wc], logger);

    await target.insertCSS('.ad {}');
    await flush();

    expect(wc.insertCSS).not.toHaveBeenCalled();
    target.dispose();
  });

  it('ignores devtools webContents', async () => {
    const app = makeApp();
    const wc = makeWebContents(APP_URL, 'devtools');
    const logger = new Logger('error', false);
    const target = new WebContentsCssTarget(app, () => [wc], logger);

    await target.insertCSS('.ad {}');
    await flush();

    expect(wc.insertCSS).not.toHaveBeenCalled();
    target.dispose();
  });

  it('re-injects rules after a navigation', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsCssTarget(app, () => [wc], logger);

    await target.insertCSS('.ad {}');
    await flush();
    expect(wc.insertCSS).toHaveBeenCalledTimes(1);

    wc.emit('did-finish-load');
    await flush();
    expect(wc.insertCSS).toHaveBeenCalledTimes(2);
    target.dispose();
  });

  it('adopts webContents created after activation', async () => {
    const app = makeApp();
    const logger = new Logger('error', false);
    const target = new WebContentsCssTarget(app, () => [], logger);

    await target.insertCSS('.ad {}');
    const wc = makeWebContents();
    app.emit('web-contents-created', null, wc);
    wc.emit('did-finish-load');
    await flush();

    expect(wc.insertCSS).toHaveBeenCalledWith('.ad {}');
    target.dispose();
  });

  it('removes inserted CSS on removeCSS', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsCssTarget(app, () => [wc], logger);

    const id = await target.insertCSS('.ad {}');
    await flush();
    expect(wc.insertCSS).toHaveBeenCalledTimes(1);

    await target.removeCSS(id);
    expect(wc.removeInsertedCSS).toHaveBeenCalledWith('key-1');
    target.dispose();
  });

  it('drops destroyed webContents', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsCssTarget(app, () => [wc], logger);

    await target.insertCSS('.ad {}');
    await flush();
    wc.destroy();
    wc.emit('destroyed');
    await target.insertCSS('.ad2 {}');
    await flush();

    expect(wc.insertCSS).toHaveBeenCalledTimes(1);
    target.dispose();
  });

  it('stops listening and injecting after dispose', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsCssTarget(app, () => [wc], logger);

    expect(app.listenerCount('web-contents-created')).toBe(1);
    target.dispose();
    expect(target.isDisposed()).toBe(true);
    expect(app.listenerCount('web-contents-created')).toBe(0);

    await target.insertCSS('.ad {}');
    await flush();
    expect(wc.insertCSS).not.toHaveBeenCalled();

    target.dispose();
    expect(target.isDisposed()).toBe(true);
  });
});
