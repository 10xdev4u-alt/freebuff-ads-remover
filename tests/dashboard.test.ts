import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Dashboard, loadPackageVersion } from '../src/dashboard.js';
import { StatsStore } from '../src/stats-store.js';
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
}

function makeWebContents(): MockWebContents {
  const listeners = new Map<string, Array<() => void>>();
  return {
    getType: () => 'window',
    getURL: () => APP_URL,
    isDestroyed: () => false,
    executeJavaScript: vi.fn(() => Promise.resolve()),
    on: (event: string, listener: () => void) => {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
    },
    emit: (event: string) => {
      for (const listener of listeners.get(event) ?? []) listener();
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

const CLIENT_SOURCE = '/* fake client */ globalThis.farBuffShield = globalThis.farBuffShield || {};';

describe('Dashboard', () => {
  let store: StatsStore;
  let logger: Logger;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new StatsStore(() => 1_700_000_000_000);
    logger = new Logger('error', false);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('injects the client source with the install call', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const dashboard = new Dashboard(store, logger, { clientSource: CLIENT_SOURCE });

    dashboard.activate(app, () => [wc]);
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1);
    const code = String(wc.executeJavaScript.mock.calls[0]?.[0]);
    expect(code).toContain(CLIENT_SOURCE);
    expect(code).toContain('farBuffShield.install');
    expect(code).toContain('billboard');
    expect(code).toContain('version');
    dashboard.deactivate();
  });

  it('loads the package version as a string', () => {
    expect(typeof loadPackageVersion()).toBe('string');
  });

  it('pushes snapshot updates every second', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const dashboard = new Dashboard(store, logger, { clientSource: CLIENT_SOURCE });

    dashboard.activate(app, () => [wc]);
    const before = wc.executeJavaScript.mock.calls.length;

    store.record({ stage: 'delivery', surface: 'sponsorBreak', endpoint: '/api/ad/impression' });
    vi.advanceTimersByTime(1000);

    expect(wc.executeJavaScript.mock.calls.length).toBeGreaterThan(before);
    const lastCall = String(wc.executeJavaScript.mock.calls.at(-1)?.[0]);
    expect(lastCall).toContain('farBuffShield.update');
    expect(lastCall).toContain('"total":1');
    dashboard.deactivate();
  });

  it('stops pushing after deactivate', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const dashboard = new Dashboard(store, logger, { clientSource: CLIENT_SOURCE });

    dashboard.activate(app, () => [wc]);
    dashboard.deactivate();
    const afterDeactivate = wc.executeJavaScript.mock.calls.length;

    vi.advanceTimersByTime(5000);
    expect(wc.executeJavaScript.mock.calls.length).toBe(afterDeactivate);
    expect(app.listenerCount('web-contents-created')).toBe(0);
    const lastCall = String(wc.executeJavaScript.mock.calls.at(-1)?.[0]);
    expect(lastCall).toContain('farBuffShield.unmount');
  });

  it('does not start when disabled, but stores deps for later', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const dashboard = new Dashboard(store, logger, { clientSource: CLIENT_SOURCE, enabled: false });

    dashboard.activate(app, () => [wc]);
    expect(dashboard.isActive()).toBe(false);
    expect(wc.executeJavaScript).not.toHaveBeenCalled();

    dashboard.setEnabled(true);
    expect(dashboard.isActive()).toBe(true);
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1);
    dashboard.deactivate();
  });

  it('stops when disabled at runtime', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const dashboard = new Dashboard(store, logger, { clientSource: CLIENT_SOURCE });

    dashboard.activate(app, () => [wc]);
    expect(dashboard.isActive()).toBe(true);

    dashboard.setEnabled(false);
    expect(dashboard.isActive()).toBe(false);
    const after = wc.executeJavaScript.mock.calls.length;
    vi.advanceTimersByTime(3000);
    expect(wc.executeJavaScript.mock.calls.length).toBe(after);
    dashboard.deactivate();
  });

  it('activating twice does not stack intervals', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const dashboard = new Dashboard(store, logger, { clientSource: CLIENT_SOURCE });

    dashboard.activate(app, () => [wc]);
    dashboard.activate(app, () => [wc]);
    expect(vi.getTimerCount()).toBe(1);
    dashboard.deactivate();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tolerates a missing client source without throwing', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const dashboard = new Dashboard(store, logger);

    expect(() => {
      dashboard.activate(app, () => [wc]);
    }).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(wc.executeJavaScript).not.toHaveBeenCalled();
    expect(dashboard.isActive()).toBe(true);
    dashboard.deactivate();
  });

  it('ignores push and setEnabled before activation', () => {
    const dashboard = new Dashboard(store, logger, { clientSource: CLIENT_SOURCE });
    expect(() => {
      dashboard.push();
      dashboard.setEnabled(true);
      dashboard.deactivate();
    }).not.toThrow();
    expect(dashboard.isActive()).toBe(false);
  });

  it('re-injects after navigation via the script target', () => {
    const app = makeApp();
    const wc = makeWebContents();
    const dashboard = new Dashboard(store, logger, { clientSource: CLIENT_SOURCE });

    dashboard.activate(app, () => [wc]);
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(1);
    wc.emit('did-finish-load');
    expect(wc.executeJavaScript).toHaveBeenCalledTimes(2);
    dashboard.deactivate();
  });
});
