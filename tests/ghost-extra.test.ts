import { describe, it, expect, vi } from 'vitest';
import { wrapIpcMain } from '../src/ghost/ipc-guard.js';
import { GhostRuntime } from '../src/ghost/runtime.js';
import { installScrubber, isAdContext, scrubPayload } from '../src/ghost/identifier-scrubber.js';
import { eraseContext } from '../src/ghost/context-eraser.js';
import { loadRules, rulesForPreset } from '../src/ghost/rules.js';
import { verifyStealth } from '../src/ghost/stealth-verifier.js';

function fakeIpc() {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => { listeners.set(channel, listener); }),
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => { handlers.set(channel, handler); }),
    listener: (channel: string) => listeners.get(channel),
    handler: (channel: string) => handlers.get(channel),
  };
}

describe('wrapIpcMain', () => {
  it('scrubs ad-context payloads for on and handle', () => {
    const ipc = fakeIpc();
    const seen: unknown[] = [];
    wrapIpcMain(ipc, ['adSlot'], ['slotId']);

    ipc.on('c', (_event: unknown, payload: unknown) => seen.push(payload));
    ipc.handle('h', (_event: unknown, payload: unknown) => seen.push(payload));

    ipc.listener('c')!({}, { adSlot: 1, slotId: 'secret', other: 1 });
    ipc.handler('h')!({}, { adSlot: 1, slotId: 'secret', other: 1 });

    expect(seen).toEqual([
      { adSlot: 1, slotId: '[redacted]', other: 1 },
      { adSlot: 1, slotId: '[redacted]', other: 1 },
    ]);
  });

  it('leaves non-ad payloads untouched', () => {
    const ipc = fakeIpc();
    const seen: unknown[] = [];
    wrapIpcMain(ipc, ['adSlot'], ['slotId']);
    ipc.on('c', (_event: unknown, payload: unknown) => seen.push(payload));

    const payload = { other: 1 };
    ipc.listener('c')!({}, payload);
    expect(seen[0]).toBe(payload);
  });

  it('fails open on a payload that cannot be serialized', () => {
    const ipc = fakeIpc();
    const seen: unknown[] = [];
    wrapIpcMain(ipc, ['adSlot'], ['slotId']);
    ipc.on('c', (_event: unknown, payload: unknown) => seen.push(payload));

    const circular: Record<string, unknown> = { adSlot: 1, slotId: 'x' };
    circular.self = circular;
    expect(() => { ipc.listener('c')!({}, circular); }).not.toThrow();
    expect(seen).toEqual([circular]);
  });

  it('does nothing when the listener has no payload argument', () => {
    const ipc = fakeIpc();
    const calls: unknown[][] = [];
    wrapIpcMain(ipc, ['adSlot'], ['slotId']);
    ipc.on('c', (...args: unknown[]) => calls.push(args));

    ipc.listener('c')!({});
    expect(calls).toEqual([[{}]]);
  });

  it('is idempotent and uninstall restores the originals', () => {
    const ipc = fakeIpc();
    const on = ipc.on;
    const handle = ipc.handle;
    const first = wrapIpcMain(ipc, ['adSlot'], ['slotId']);
    const wrappedOn = ipc.on;
    const wrappedHandle = ipc.handle;
    const second = wrapIpcMain(ipc, ['adSlot'], ['slotId']);
    expect(ipc.on).toBe(wrappedOn);
    expect(ipc.handle).toBe(wrappedHandle);
    second.uninstall();
    first.uninstall();
    expect(ipc.on).toBe(on);
    expect(ipc.handle).toBe(handle);
  });
});

describe('identifier scrubber', () => {
  it('detects ad context in strings and objects only', () => {
    expect(isAdContext('has adSlot here', ['adSlot'])).toBe(true);
    expect(isAdContext({ a: 'adSlot' }, ['adSlot'])).toBe(true);
    expect(isAdContext({ a: 'nope' }, ['adSlot'])).toBe(false);
    expect(isAdContext(42, ['adSlot'])).toBe(false);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(isAdContext(circular, ['adSlot'])).toBe(false);
  });

  it('scrubs only own properties and clones arrays', () => {
    expect(scrubPayload(null, ['a'])).toBeNull();
    expect(scrubPayload('x', ['a'])).toBe('x');
    expect(scrubPayload({ a: 1, b: 2 }, ['a'])).toEqual({ a: '[redacted]', b: 2 });
    expect(scrubPayload([1, 2], ['a'])).toEqual([1, 2]);
    const original = { a: 1 };
    const out = scrubPayload(original, ['a']) as Record<string, unknown>;
    expect(original.a).toBe(1);
    expect(out).not.toBe(original);
  });

  it('installs a postMessage scrubber that can be uninstalled once', () => {
    const sent: unknown[] = [];
    const host = { postMessage: (m: unknown) => sent.push(m) };
    const handle = installScrubber(['adSlot'], ['slotId'], host);
    host.postMessage({ adSlot: 1, slotId: 'secret', other: 1 });
    host.postMessage('plain');
    expect(sent).toEqual([
      { adSlot: 1, slotId: '[redacted]', other: 1 },
      'plain',
    ]);

    const again = installScrubber(['adSlot'], ['slotId'], host);
    handle.uninstall();
    again.uninstall();
    host.postMessage({ adSlot: 1, slotId: 'after' });
    expect(sent).toEqual([
      { adSlot: 1, slotId: '[redacted]', other: 1 },
      'plain',
      { adSlot: 1, slotId: 'after' },
    ]);
  });
});

describe('eraseContext', () => {
  it('erases globals, timers, observers and styles', () => {
    const host: Record<string, unknown> = { adGlobal: 1 };
    const observer = { disconnect: vi.fn() };
    const style = { remove: vi.fn() } as unknown as Element;
    const count = eraseContext(
      { globals: ['adGlobal'], timers: [123], observers: [observer], styles: [style] },
      host,
    );
    expect(count).toBe(4);
    expect(host.adGlobal).toBeUndefined();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(style.remove).toHaveBeenCalled();
  });

  it('fails open when a teardown step throws', () => {
    const host = new Proxy(
      {},
      {
        deleteProperty() { throw new Error('nope'); },
        get() { return undefined; },
        has() { return false; },
      },
    );
    const observer = { disconnect: () => { throw new Error('nope'); } };
    const style = { remove: () => { throw new Error('nope'); } } as unknown as Element;
    expect(() => eraseContext({ globals: ['x'], observers: [observer], styles: [style] }, host)).not.toThrow();
    expect(eraseContext({}, host)).toBe(0);
  });
});

describe('ghost rules', () => {
  it('returns the per-preset rule set', () => {
    expect(rulesForPreset('standard').map((r) => r.id)).toEqual(['dom-marker-strip', 'dom-marker-google', 'global-teardown']);
    expect(rulesForPreset('aggressive').length).toBe(5);
    expect(rulesForPreset('paranoid').length).toBe(6);
    expect(loadRules('paranoid')).toEqual(rulesForPreset('paranoid'));
    expect(rulesForPreset('standard')).not.toBe(rulesForPreset('standard'));
  });
});

describe('verifyStealth', () => {
  it('reports stripped markers and globals and passes', () => {
    const report = verifyStealth(
      { markers: ['data-ad-slot'], globals: ['adsbygoogle'], ipcCount: 2 },
      { markers: [], globals: [], ipcCount: 0 },
      { markers: [], globals: [], ipcCount: 0 },
    );
    expect(report).toMatchObject({ markersStripped: 1, globalsErased: 1, ipcScrubbed: 2, pass: true });
    expect(report.delta).toEqual([]);
  });

  it('flags new markers and globals that were not in the baseline', () => {
    const report = verifyStealth(
      { markers: [], globals: [], ipcCount: 0 },
      { markers: ['data-ad-slot'], globals: ['adsbygoogle'], ipcCount: 0 },
      { markers: [], globals: [], ipcCount: 0 },
    );
    expect(report.pass).toBe(false);
    expect(report.delta).toEqual(['marker:data-ad-slot', 'global:adsbygoogle']);
  });
});

describe('GhostRuntime', () => {
  it('stays inactive when disabled', () => {
    const rt = new GhostRuntime({ enabled: false, preset: 'standard' });
    const ipc = fakeIpc();
    rt.activate(ipc);
    expect(rt.report()).toEqual({ enabled: false, preset: 'standard', active: false });
    expect(ipc.on).not.toHaveBeenCalled();
  });

  it('activates without ipc and deactivates cleanly', () => {
    const rt = new GhostRuntime({ enabled: true, preset: 'aggressive' });
    rt.activate();
    expect(rt.report().active).toBe(true);
    rt.activate();
    rt.deactivate();
    expect(rt.report().active).toBe(false);
  });

  it('wraps ipc and re-activates on config change', () => {
    const ipc = fakeIpc();
    const rt = new GhostRuntime({ enabled: true, preset: 'aggressive' });
    const originalOn = ipc.on;
    rt.activate(ipc);
    expect(ipc.on).not.toBe(originalOn);

    rt.updateConfig({ enabled: true, preset: 'paranoid' });
    expect(rt.report()).toEqual({ enabled: true, preset: 'paranoid', active: true });
    // The IPC binding must survive the deactivate/reactivate cycle.
    expect(ipc.on).not.toBe(originalOn);

    const seen: unknown[] = [];
    ipc.on('c', (_event: unknown, payload: unknown) => { seen.push(payload); });
    ipc.listener('c')!({}, { adSlot: 1, slotId: 'secret' });
    expect(seen).toEqual([{ adSlot: 1, slotId: '[redacted]' }]);

    rt.updateConfig({ enabled: false, preset: 'paranoid' });
    expect(rt.report().active).toBe(false);
    expect(ipc.on).toBe(originalOn);
  });
});
