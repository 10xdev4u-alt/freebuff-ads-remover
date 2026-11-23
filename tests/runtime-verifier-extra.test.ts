/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { RuntimeVerifier } from '../src/runtime-verifier.js';
import type { DebuggerLike, WebContentsLike } from '../src/runtime-verifier.js';

function logger(): any {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

interface FakeDebugger extends DebuggerLike {
  emit(method: string, params: Record<string, unknown>): void;
  evaluate(expr: string): void;
  setEvaluator(fn: (expr: string) => void): void;
}

function fakeDebugger(): FakeDebugger {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  let onEvaluate: (expr: string) => void = () => {};
  return {
    attach: vi.fn((_protocolVersion: string) => {}),
    detach: vi.fn(() => {}),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => { listeners.set(event, listener); }),
    off: vi.fn((event: string) => { listeners.delete(event); }),
    sendCommand: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'Runtime.evaluate') {
        onEvaluate(typeof params?.expression === 'string' ? params.expression : '');
      }
      return {};
    }),
    emit: (method: string, params: Record<string, unknown>) => {
      const listener = listeners.get('message');
      if (listener) listener({}, method, params);
    },
    evaluate: (expr: string) => { onEvaluate(expr); },
    setEvaluator: (fn: (expr: string) => void) => { onEvaluate = fn; },
  };
}

function makeWc(overrides: Record<string, unknown> = {}): { wc: WebContentsLike; dbg: FakeDebugger } {
  const dbg = fakeDebugger();
  const wc = {
    getType: () => 'window',
    getURL: () => 'http://127.0.0.1:5174/',
    isDestroyed: () => false,
    debugger: dbg,
    ...overrides,
  } as WebContentsLike;
  return { wc, dbg };
}

interface VerifierInternals {
  origins: Map<WebContentsLike, string>;
  attached: Set<WebContentsLike>;
  logger: { warn: (message: string, ...args: unknown[]) => void };
  getAll: (() => WebContentsLike[]) | null;
  wcCreatedHandler: ((...a: unknown[]) => void) | null;
  config: { timeoutMs: number; concurrency: number; probeRoutes: string[] };
}

function internals(v: RuntimeVerifier): VerifierInternals {
  return v as unknown as VerifierInternals;
}

describe('RuntimeVerifier.attachOne', () => {
  it('skips destroyed, non-window, non-target and debugger-less webContents', () => {
    const v = new RuntimeVerifier(logger());
    expect(v.attachOne({ ...makeWc().wc, isDestroyed: () => true })).toBe(false);
    expect(v.attachOne({ ...makeWc().wc, getType: () => 'browserview' })).toBe(false);
    expect(v.attachOne({ ...makeWc().wc, getURL: () => 'https://evil.example.com/' })).toBe(false);
    expect(v.attachOne(makeWc({ debugger: undefined }).wc)).toBe(false);
    expect(v.getAttachedCount()).toBe(0);
  });

  it('attaches to a target window and derives the origin from its URL', () => {
    const { wc, dbg } = makeWc({ getURL: () => 'http://127.0.0.1:9999/' });
    const v = new RuntimeVerifier(logger());
    expect(v.attachOne(wc)).toBe(true);
    expect(dbg.attach).toHaveBeenCalledWith('1.3');
    expect(v.getAttachedCount()).toBe(1);
    expect(internals(v).origins.get(wc)).toBe('http://127.0.0.1:9999');
  });

  it('keeps the configured origin when the URL is not http and warns on attach failure', () => {
    const { wc } = makeWc({ getURL: () => 'file:///tmp/index.html' });
    const v = new RuntimeVerifier(logger());
    expect(v.attachOne(wc)).toBe(false);

    const failing = makeWc();
    failing.dbg.attach = vi.fn(() => { throw new Error('nope'); });
    const v2 = new RuntimeVerifier(logger());
    expect(v2.attachOne(failing.wc)).toBe(false);
    expect(internals(v2).logger.warn).toHaveBeenCalledWith('RuntimeVerifier attach failed', expect.any(Error));
  });
});

describe('RuntimeVerifier.watch/dispose', () => {
  it('does nothing without an app or getAll', () => {
    const v = new RuntimeVerifier(logger());
    v.watch(null, null);
    v.watch({} as any, null);
    v.dispose();
    expect(v.getAttachedCount()).toBe(0);
  });

  it('subscribes to web-contents-created and attaches existing contents', () => {
    const { wc } = makeWc();
    const handlers: ((...args: unknown[]) => void)[] = [];
    const app = {
      on: vi.fn((_e: string, l: (...args: unknown[]) => void) => { handlers.push(l); }),
      removeListener: vi.fn(),
    };
    const v = new RuntimeVerifier(logger());
    v.watch(app, () => [wc]);
    expect(v.getAttachedCount()).toBe(1);
    handlers[0]?.({}, makeWc().wc);
    expect(v.getAttachedCount()).toBe(2);

    v.dispose();
    expect(app.removeListener).toHaveBeenCalled();
  });

  it('tolerates a removeListener that throws', () => {
    const app = { on: vi.fn(), removeListener: vi.fn(() => { throw new Error('nope'); }) };
    const v = new RuntimeVerifier(logger());
    v.watch(app, null);
    expect(() => { v.dispose(); }).not.toThrow();
    expect(internals(v).wcCreatedHandler).toBeNull();
  });
});

describe('RuntimeVerifier.run', () => {
  it('reports no-attached-targets when nothing is attached', async () => {
    const v = new RuntimeVerifier(logger());
    const report = await v.run();
    expect(report).toMatchObject({ pass: false, reason: 'no-attached-targets', targets: 0 });
    expect(v.getLastReport()).toBe(report);
  });

  it('re-attaches from getAll and ignores a throwing getAll', async () => {
    const { wc } = makeWc();
    const v = new RuntimeVerifier(logger());
    v.watch(null, () => [wc]);
    expect(v.getAttachedCount()).toBe(1);

    const v2 = new RuntimeVerifier(logger());
    v2.watch(null, () => []);
    internals(v2).getAll = () => { throw new Error('nope'); };
    const report = await v2.run();
    expect(report.reason).toBe('no-attached-targets');
  });

  it('fails a target that has no debugger', async () => {
    const { wc } = makeWc({ debugger: undefined });
    const v = new RuntimeVerifier(logger(), { probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 1 });
    // Bypass attachOne's debugger check by adding the target directly.
    internals(v).attached.add(wc);
    internals(v).origins.set(wc, 'http://127.0.0.1:5174');
    const report = await v.run();
    expect(report.pass).toBe(false);
    expect(report.targets).toBe(1);
    expect(report.reason).toBe('no-ad-probes');
  });

  it('passes when every ad route is blocked and every control is reached', async () => {
    const { wc, dbg } = makeWc();
    dbg.setEvaluator((expr: string) => {
      const isAd = expr.includes('/api/ad/');
      const id = expr.match(/__far_verify_[a-z0-9]+/)?.[0] ?? '';
      dbg.emit('Network.requestWillBeSent', { requestId: 'r1', request: { url: 'http://127.0.0.1:5174' + (isAd ? '/api/ad/policy' : '/healthz') + '?x=' + id } });
      if (isAd) {
        dbg.emit('Network.loadingFailed', { requestId: 'r1', errorText: 'net::ERR_BLOCKED_BY_CLIENT' });
      } else {
        dbg.emit('Network.responseReceived', { requestId: 'r1', response: { status: 200 } });
      }
    });
    const v = new RuntimeVerifier(logger(), { probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 1, timeoutMs: 1000 });
    v.attachAll([wc]);
    const report = await v.run();
    expect(report.pass).toBe(true);
    expect(report.probes.map((p) => p.outcome)).toEqual(['blocked', 'reached']);
  });

  it('fails when an ad route is not blocked', async () => {
    const { wc, dbg } = makeWc();
    dbg.setEvaluator((expr: string) => {
      const id = expr.match(/__far_verify_[a-z0-9]+/)?.[0] ?? '';
      dbg.emit('Network.requestWillBeSent', { requestId: 'r1', request: { url: 'http://x/api/ad/policy?' + id } });
      dbg.emit('Network.responseReceived', { requestId: 'r1', response: { status: 200 } });
    });
    const v = new RuntimeVerifier(logger(), { probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 1, timeoutMs: 1000 });
    v.attachAll([wc]);
    const report = await v.run();
    expect(report.pass).toBe(false);
    expect(report.reason).toBe('ad-not-blocked');
  });

  it('reports failed-other for a non-blocker failure and a 5xx control', async () => {
    const { wc, dbg } = makeWc();
    dbg.setEvaluator((expr: string) => {
      const id = expr.match(/__far_verify_[a-z0-9]+/)?.[0] ?? '';
      const isAd = expr.includes('/api/ad/');
      dbg.emit('Network.requestWillBeSent', { requestId: 'r1', request: { url: 'http://x' + (isAd ? '/api/ad/policy' : '/healthz') + '?' + id } });
      if (isAd) {
        dbg.emit('Network.loadingFailed', { requestId: 'r1', errorText: 'net::ERR_FAILED' });
      } else {
        dbg.emit('Network.responseReceived', { requestId: 'r1', response: { status: 500 } });
      }
    });
    const v = new RuntimeVerifier(logger(), { probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 1, timeoutMs: 1000 });
    v.attachAll([wc]);
    const report = await v.run();
    expect(report.pass).toBe(false);
    expect(report.probes[0]?.outcome).toBe('failed-other');
    expect(report.probes[1]?.outcome).toBe('failed-other');
    expect(report.reason).toBe('ad-not-blocked');
  });

  it('waits past a 3xx redirect and reports the final response', async () => {
    const { wc, dbg } = makeWc();
    dbg.setEvaluator((expr: string) => {
      const id = expr.match(/__far_verify_[a-z0-9]+/)?.[0] ?? '';
      const isAd = expr.includes('/api/ad/');
      dbg.emit('Network.requestWillBeSent', { requestId: 'r1', request: { url: 'http://x' + (isAd ? '/api/ad/policy' : '/healthz') + '?' + id } });
      if (isAd) {
        dbg.emit('Network.loadingFailed', { requestId: 'r1', errorText: 'net::ERR_BLOCKED_BY_CLIENT' });
      } else {
        dbg.emit('Network.responseReceived', { requestId: 'r1', response: { status: 302 } });
        dbg.emit('Network.responseReceived', { requestId: 'r1', response: { status: 404 } });
      }
    });
    const v = new RuntimeVerifier(logger(), { probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 1, timeoutMs: 1000 });
    v.attachAll([wc]);
    const report = await v.run();
    expect(report.pass).toBe(true);
    expect(report.probes[1]?.outcome).toBe('reached');
  });

  it('times out when the renderer never answers', async () => {
    const { wc, dbg } = makeWc();
    dbg.setEvaluator(() => { /* no response */ });
    const v = new RuntimeVerifier(logger(), { probeRoutes: ['/api/ad/policy'], controlRoutes: [], concurrency: 1, timeoutMs: 10 });
    v.attachAll([wc]);
    const report = await v.run();
    expect(report.pass).toBe(false);
    expect(report.probes[0]?.outcome).toBe('timeout');
  });

  it('ignores events for unknown request ids and dedupes extra probe routes', async () => {
    const { wc, dbg } = makeWc();
    dbg.setEvaluator(() => {
      dbg.emit('Network.requestWillBeSent', { requestId: 'other', request: { url: 'http://x/healthz?unrelated' } });
      dbg.emit('Network.loadingFailed', { requestId: 'other', errorText: 'net::ERR_BLOCKED_BY_CLIENT' });
      dbg.emit('Network.responseReceived', { requestId: 'other', response: { status: 200 } });
    });
    const v = new RuntimeVerifier(logger(), { probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 1, timeoutMs: 20 });
    v.attachAll([wc]);
    const report = await v.run(['/api/ad/policy']);
    expect(report.probes).toHaveLength(2);
    expect(report.probes.every((p) => p.outcome === 'timeout')).toBe(true);
  });

  it('detaches every attached debugger and clears origins', async () => {
    const a = makeWc();
    const b = makeWc();
    const v = new RuntimeVerifier(logger());
    v.attachAll([a.wc, b.wc]);
    v.detachAll();
    expect(a.dbg.detach).toHaveBeenCalled();
    expect(b.dbg.detach).toHaveBeenCalled();
    expect(v.getAttachedCount()).toBe(0);
    expect(internals(v).origins.size).toBe(0);
  });

  it('logs a detach failure without throwing', () => {
    const a = makeWc();
    a.dbg.detach = vi.fn(() => { throw new Error('nope'); });
    const v = new RuntimeVerifier(logger());
    v.attachAll([a.wc]);
    expect(() => { v.detachAll(); }).not.toThrow();
  });

  it('merges updateConfig into the defaults', () => {
    const v = new RuntimeVerifier(logger());
    v.updateConfig({ timeoutMs: 5, concurrency: 2 });
    expect(internals(v).config.timeoutMs).toBe(5);
    expect(internals(v).config.concurrency).toBe(2);
    expect(internals(v).config.probeRoutes.length).toBeGreaterThan(0);
  });
});
