import { describe, it, expect, afterEach, vi } from 'vitest';
import { getElectron } from '../src/electron-bridge.js';

const proc = process as unknown as { _linkedBinding?: ((name: string) => unknown) | undefined };

const original = proc._linkedBinding;

afterEach(() => {
  if (original === undefined) delete proc._linkedBinding;
  else proc._linkedBinding = original;
  vi.restoreAllMocks();
});

function fakeApp() {
  return { whenReady: () => Promise.resolve(), on: () => undefined, removeListener: () => undefined };
}

function bindingReturning(value: unknown): (name: string) => unknown {
  return (name: string) => (name === 'electron_browser_app' ? value : {});
}

describe('getElectron via linked bindings', () => {
  it('returns a bridge when the linked binding exposes app and session', () => {
    const app = fakeApp();
    proc._linkedBinding = (name: string) => (name === 'electron_browser_app' ? app : {});
    const bridge = getElectron();
    expect(bridge).not.toBeNull();
    expect(bridge?.app).toBe(app);
    expect(bridge?.session).toBeInstanceOf(Object);
    expect(bridge?.webContents).toBeNull();
  });

  it('passes webContents through when present', () => {
    proc._linkedBinding = (name: string) => (name === 'electron_browser_app' ? fakeApp() : {});
    const bridge = getElectron();
    expect(bridge?.webContents).toBeNull();
  });

  it('rejects a binding whose app lacks whenReady or on', () => {
    proc._linkedBinding = bindingReturning({ on: () => undefined });
    expect(getElectron()).toBeNull();

    proc._linkedBinding = bindingReturning({ whenReady: () => Promise.resolve() });
    expect(getElectron()).toBeNull();
  });

  it('rejects a binding without app or session', () => {
    proc._linkedBinding = () => null;
    expect(getElectron()).toBeNull();
  });

  it('returns null when the binding is not a function', () => {
    proc._linkedBinding = undefined;
    expect(getElectron()).toBeNull();
  });

  it('returns null when the binding throws', () => {
    proc._linkedBinding = () => { throw new Error('boom'); };
    expect(getElectron()).toBeNull();
  });
});
