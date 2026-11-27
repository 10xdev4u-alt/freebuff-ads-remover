import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activate, deactivate, getGhostReport } from '../src/bootstrap.js';

const oldDir = process.env.FREEBUFF_CONFIG_DIR;
let dir: string;

function writeConfig(patch: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify({ ghost: { enabled: true, preset: 'aggressive' }, ...patch }, null, 2),
  );
}

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

function fakeApp() {
  return {
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-ipc-boot-'));
  process.env.FREEBUFF_CONFIG_DIR = dir;
  writeConfig({});
});

afterEach(() => {
  deactivate();
  if (oldDir === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
  else process.env.FREEBUFF_CONFIG_DIR = oldDir;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('bootstrap Ghost IPC wiring', () => {
  it('wraps on and handle when Ghost Mode is enabled', () => {
    const ipc = fakeIpc();
    const originalOn = ipc.on;
    const originalHandle = ipc.handle;
    expect(activate(undefined, { app: fakeApp(), ipcMain: ipc })).toBe(true);
    expect(ipc.on).not.toBe(originalOn);
    expect(ipc.handle).not.toBe(originalHandle);
    expect(getGhostReport()?.active).toBe(true);
  });

  it('scrubs ad-context payloads delivered to ipcMain.on', () => {
    const ipc = fakeIpc();
    activate(undefined, { app: fakeApp(), ipcMain: ipc });
    const seen: Record<string, unknown>[] = [];
    ipc.on('ads:context', (...args: unknown[]) => { seen.push(args[1] as Record<string, unknown>); });
    const payload = { adSlot: 'x', slotId: 'secret', impressionId: 'i', keep: 1 };
    ipc.listener('ads:context')?.({}, payload);
    expect(seen[0]).toMatchObject({ adSlot: 'x', slotId: '[redacted]', impressionId: '[redacted]', keep: 1 });
    expect(seen[0]).not.toBe(payload);
    expect(payload.slotId).toBe('secret');
  });

  it('scrubs handle payloads and preserves the handler return value', () => {
    const ipc = fakeIpc();
    activate(undefined, { app: fakeApp(), ipcMain: ipc });
    let seen: Record<string, unknown> | null = null;
    ipc.handle('ads:context', (...args: unknown[]) => {
      seen = args[1] as Record<string, unknown>;
      return 'sentinel';
    });
    const result = ipc.handler('ads:context')?.({}, { adSlot: 'x', slotId: 'secret' });
    expect(result).toBe('sentinel');
    expect(seen).toMatchObject({ slotId: '[redacted]' });
  });

  it('passes unrelated channels and non-ad payloads through unchanged', () => {
    const ipc = fakeIpc();
    activate(undefined, { app: fakeApp(), ipcMain: ipc });
    const payload = { slotId: 'keep', name: 'ok' };
    let first: unknown = null;
    ipc.on('ads:context', (...args: unknown[]) => { first = args[1]; });
    ipc.listener('ads:context')?.({}, payload);
    expect(first).toBe(payload);

    const other = { foo: 'bar' };
    let second: unknown = null;
    ipc.on('app:ready', (...args: unknown[]) => { second = args[1]; });
    ipc.listener('app:ready')?.({}, other);
    expect(second).toBe(other);
  });

  it('leaves ipcMain untouched when Ghost Mode is disabled', () => {
    writeConfig({ ghost: { enabled: false, preset: 'aggressive' } });
    const ipc = fakeIpc();
    const originalOn = ipc.on;
    activate(undefined, { app: fakeApp(), ipcMain: ipc });
    expect(ipc.on).toBe(originalOn);
    const payload = { adSlot: 'x', slotId: 'secret' };
    let seen: Record<string, unknown> | null = null;
    ipc.on('ads:context', (...args: unknown[]) => { seen = args[1] as Record<string, unknown>; });
    ipc.listener('ads:context')?.({}, payload);
    expect(seen).toBe(payload);
  });

  it('uninstalls the guard on deactivate', () => {
    const ipc = fakeIpc();
    const originalOn = ipc.on;
    const originalHandle = ipc.handle;
    activate(undefined, { app: fakeApp(), ipcMain: ipc });
    expect(ipc.on).not.toBe(originalOn);
    deactivate();
    expect(ipc.on).toBe(originalOn);
    expect(ipc.handle).toBe(originalHandle);
    expect(getGhostReport()).toBeNull();
  });

  it('re-arms the guard when the preset changes', async () => {
    const ipc = fakeIpc();
    activate(undefined, { app: fakeApp(), ipcMain: ipc });
    writeConfig({ ghost: { enabled: true, preset: 'paranoid' } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(getGhostReport()?.preset).toBe('paranoid');
    let seen: Record<string, unknown> | null = null;
    ipc.on('ads:context', (...args: unknown[]) => { seen = args[1] as Record<string, unknown>; });
    ipc.listener('ads:context')?.({}, { adSlot: 'x', slotId: 'secret' });
    expect(seen).toMatchObject({ slotId: '[redacted]' });
  }, 5000);
});
