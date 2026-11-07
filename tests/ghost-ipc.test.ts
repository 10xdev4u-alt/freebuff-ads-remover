import { describe, it, expect } from 'vitest';
import { wrapIpcMain } from '../src/ghost/ipc-guard.js';

describe('ghost ipc guard', () => {
  it('round-trips non-ad channel unchanged', () => {
    const handlers: Record<string, (...a: unknown[]) => unknown> = {};
    const ipc = {
      on: (c: string, l: (...a: unknown[]) => void) => { handlers[c] = l; },
      handle: (c: string, h: (...a: unknown[]) => unknown) => { handlers[c] = h; },
    };
    wrapIpcMain(ipc, ['slotId'], ['slotId']);
    const calls: unknown[] = [];
    ipc.on('foo', (_e, payload) => { calls.push(payload); });
    handlers['foo']!({}, { bar: 1 });
    expect(calls[0]).toEqual({ bar: 1 });
  });
  it('redacts ad-context payload', () => {
    const handlers: Record<string, (...a: unknown[]) => unknown> = {};
    const ipc = {
      on: (c: string, l: (...a: unknown[]) => void) => { handlers[c] = l; },
      handle: (c: string, h: (...a: unknown[]) => unknown) => { handlers[c] = h; },
    };
    wrapIpcMain(ipc, ['slotId'], ['slotId']);
    const calls: unknown[] = [];
    ipc.on('ads:context', (_e, payload) => { calls.push(payload); });
    handlers['ads:context']!({}, { slotId: 'abc', name: 'x' });
    const r = calls[0] as { slotId: string };
    expect(r.slotId).toBe('[redacted]');
  });
  it('uninstall restores', () => {
    const ipc = { on: (_c: string, _l: (...a: unknown[]) => void) => {}, handle: (_c: string, _h: (...a: unknown[]) => unknown) => {} };
    const origOn = ipc.on;
    const h = wrapIpcMain(ipc, ['slotId'], ['slotId']);
    expect(ipc.on).not.toBe(origOn);
    h.uninstall();
    expect(ipc.on).toBe(origOn);
  });
});
