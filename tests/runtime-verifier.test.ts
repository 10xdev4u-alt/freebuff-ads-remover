/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi } from 'vitest';
import { RuntimeVerifier } from '../src/runtime-verifier.js';
import type { WebContentsLike, DebuggerLike } from '../src/runtime-verifier.js';

function makeDebugger(): DebuggerLike & { listeners: Map<string, Set<(...a: unknown[]) => void>>; emit: (e: string, p: unknown) => void } {
  const listeners = new Map<string, Set<(...a: unknown[]) => void>>();
  const dbg: DebuggerLike & { listeners: Map<string, Set<(...a: unknown[]) => void>>; emit: (e: string, p: unknown) => void } = {
    listeners,
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand: vi.fn().mockResolvedValue({}),
    on: (e, l) => { if (!listeners.has(e)) listeners.set(e, new Set()); listeners.get(e)!.add(l); },
    off: (e, l) => { listeners.get(e)?.delete(l); },
    emit(method, params) { listeners.get('message')?.forEach((l) => { (l as (e: unknown, m: unknown, p: unknown) => void)({}, method, params); }); },
  };
  return dbg;
}

function makeContents(url: string, type = 'window'): WebContentsLike {
  const dbg = makeDebugger();
  return { getType: () => type, getURL: () => url, isDestroyed: () => false, debugger: dbg };
}

describe('RuntimeVerifier', () => {
  it('attaches only to window-type app-origin contents', () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const v = new RuntimeVerifier(logger as any, { timeoutMs: 100, probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 2 });
    const a = makeContents('http://127.0.0.1:5174/x');
    const b = makeContents('https://example.com/x');
    const c = makeContents('http://127.0.0.1:5174/y', 'webview');
    v.attachAll([a, b, c]);
    expect(v.getAttachedCount()).toBe(1);
  });

  it('returns no-attached-targets when nothing attached', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const v = new RuntimeVerifier(logger as any, { timeoutMs: 100, probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 2 });
    const r = await v.run();
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('no-attached-targets');
  });

  it('marks ad probe blocked on ERR_BLOCKED_BY_CLIENT', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const wc = makeContents('http://127.0.0.1:5174/x');
    const v = new RuntimeVerifier(logger as any, { timeoutMs: 200, probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 2 });
    v.attachAll([wc]);
    const dbg = wc.debugger as any;
    // simulate: when fetch triggers requestWillBeSent, then loadingFailed with blocked error
    const runPromise = v.run();
    // wait a tick for probe to register listener & evaluate
    await new Promise((r) => setTimeout(r, 20));
    const evalCall = (dbg.sendCommand).mock.calls.find((c: any[]) => c[0] === 'Runtime.evaluate');
    const urlMatch = (evalCall?.[1]?.expression as string).match(/fetch\("([^"]+)"/);
    const url = urlMatch?.[1];
    const rid = 'req-1';
    dbg.emit('Network.requestWillBeSent', { requestId: rid, request: { url } });
    dbg.emit('Network.loadingFailed', { requestId: rid, errorText: 'net::ERR_BLOCKED_BY_CLIENT' });
    // control probe: responseReceived
    // trigger second probe by emitting its request/response
    await new Promise((r) => setTimeout(r, 20));
    const evalCalls = (dbg.sendCommand).mock.calls.filter((c: any[]) => c[0] === 'Runtime.evaluate');
    const controlUrl = evalCalls[1]?.[1]?.expression?.match(/fetch\("([^"]+)"/)?.[1];
    const rid2 = 'req-2';
    dbg.emit('Network.requestWillBeSent', { requestId: rid2, request: { url: controlUrl } });
    dbg.emit('Network.responseReceived', { requestId: rid2 });
    const r = await runPromise;
    expect(r.pass).toBe(true);
    expect(r.probes.find((p) => p.kind === 'ad')?.outcome).toBe('blocked');
    expect(r.probes.find((p) => p.kind === 'control')?.outcome).toBe('reached');
  });

  it('fail-open on attach failure', () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const wc: WebContentsLike = { getType: () => 'window', getURL: () => 'http://127.0.0.1:5174/x', isDestroyed: () => false, debugger: { attach: () => { throw new Error('nope'); }, detach: () => {}, sendCommand: async () => ({}), on: () => {}, off: () => {} } };
    const v = new RuntimeVerifier(logger, { timeoutMs: 100, probeRoutes: ['/api/ad/policy'], controlRoutes: ['/healthz'], concurrency: 2 });
    expect(v.attachOne(wc)).toBe(false);
    expect(v.getAttachedCount()).toBe(0);
  });
});
