import { describe, it, expect, vi } from 'vitest';
import { WebContentsScriptTarget } from '../src/web-contents-script.js';
import { Logger } from '../src/logger.js';
import type { ElectronAppLike } from '../src/electron-bridge.js';

const APP_URL = 'http://127.0.0.1:5174/';

interface MockWebContents {
  getType: () => string;
  getURL: () => string;
  isDestroyed: () => boolean;
  executeJavaScript: ReturnType<typeof vi.fn>;
  on: (event: string, listener: () => void) => void;
  emit: (event: string) => void;
  setUrl: (url: string) => void;
  destroy: () => void;
}

function makeWebContents(initialUrl = APP_URL, type = 'window'): MockWebContents {
  const listeners = new Map<string, Array<() => void>>();
  let url = initialUrl;
  let destroyed = false;

  return {
    getType: () => type,
    getURL: () => url,
    isDestroyed: () => destroyed,
    executeJavaScript: vi.fn(() => Promise.resolve()),
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

describe('WebContentsScriptTarget', () => {
  it('injects a script into existing app-origin webContents', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    target.injectScript('globalThis.x = 1;');
    await flush();

    expect(wc.executeJavaScript).toHaveBeenCalledWith('globalThis.x = 1;');
    target.dispose();
  });

  it('returns a rule id from injectScript', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    const first = target.injectScript('a;');
    const second = target.injectScript('b;');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^far-script-/);
    target.dispose();
  });

  it('ignores webContents on foreign origins', async () => {
    const app = makeApp();
    const wc = makeWebContents('https://example.com/page');
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    target.injectScript('a;');
    await flush();

    expect(wc.executeJavaScript).not.toHaveBeenCalled();
    target.dispose();
  });

  it('ignores devtools webContents', async () => {
    const app = makeApp();
    const wc = makeWebContents(APP_URL, 'devtools');
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    target.injectScript('a;');
    await flush();

    expect(wc.executeJavaScript).not.toHaveBeenCalled();
    target.dispose();
  });

  it('re-injects rules after a navigation', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    target.injectScript('a;');
    await flush();
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1);

    wc.emit('did-finish-load');
    await flush();
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2);
    target.dispose();
  });

  it('adopts webContents created after activation', async () => {
    const app = makeApp();
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [], logger);

    target.injectScript('a;');
    const wc = makeWebContents();
    app.emit('web-contents-created', null, wc);
    wc.emit('did-finish-load');
    await flush();

    expect(wc.executeJavaScript).toHaveBeenCalledWith('a;');
    target.dispose();
  });

  it('postScript fires into current app contents without registering a rule', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    target.postScript('update(1);');
    await flush();

    expect(wc.executeJavaScript).toHaveBeenCalledWith('update(1);');

    wc.emit('did-finish-load');
    await flush();
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1);
    target.dispose();
  });

  it('postScript skips devtools, foreign and destroyed contents', async () => {
    const app = makeApp();
    const good = makeWebContents();
    const devtools = makeWebContents(APP_URL, 'devtools');
    const foreign = makeWebContents('https://example.com/');
    const destroyed = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [good, devtools, foreign, destroyed], logger);

    destroyed.destroy();
    target.postScript('update(1);');
    await flush();

    expect(good.executeJavaScript).toHaveBeenCalledTimes(1);
    expect(devtools.executeJavaScript).not.toHaveBeenCalled();
    expect(foreign.executeJavaScript).not.toHaveBeenCalled();
    expect(destroyed.executeJavaScript).not.toHaveBeenCalled();
    target.dispose();
  });

  it('swallows executeJavaScript rejections', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    wc.executeJavaScript.mockReturnValue(Promise.reject(new Error('navigating')));
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    target.injectScript('a;');
    target.postScript('b;');
    await flush();

    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2);
    target.dispose();
  });

  it('drops destroyed webContents', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    target.injectScript('a;');
    await flush();
    wc.destroy();
    wc.emit('destroyed');
    target.injectScript('b;');
    await flush();

    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1);
    target.dispose();
  });

  it('stops listening and injecting after dispose', async () => {
    const app = makeApp();
    const wc = makeWebContents();
    const logger = new Logger('error', false);
    const target = new WebContentsScriptTarget(app, () => [wc], logger);

    expect(app.listenerCount('web-contents-created')).toBe(1);
    target.dispose();
    expect(target.isDisposed()).toBe(true);
    expect(app.listenerCount('web-contents-created')).toBe(0);

    target.injectScript('a;');
    target.postScript('b;');
    await flush();
    expect(wc.executeJavaScript).not.toHaveBeenCalled();

    target.dispose();
    expect(target.isDisposed()).toBe(true);
  });
});
