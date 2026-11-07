export interface IpcMainLike {
  on(channel: string, listener: (...args: unknown[]) => void): void;
  handle(channel: string, handler: (...args: unknown[]) => unknown): void;
  removeListener?(channel: string, listener: (...args: unknown[]) => void): void;
}

const WRAPPED = Symbol('ghost-ipc-wrapped');

export function wrapIpcMain(ipc: IpcMainLike, signatures: string[], fields: string[]): { uninstall: () => void } {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const origOn = ipc.on;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const origHandle = ipc.handle;
  if ((ipc as unknown as Record<symbol, boolean>)[WRAPPED]) {
    return { uninstall: () => {} };
  }
  const wrapListener = (listener: (...args: unknown[]) => void) => (...args: unknown[]) => {
    try {
      if (args.length > 1 && isAdContext(args[1], signatures)) {
        args[1] = scrub(args[1], fields);
      }
    } catch { /* fail open */ }
    listener(...args);
  };
  const wrapHandler = (handler: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
    try {
      if (args.length > 1 && isAdContext(args[1], signatures)) {
        args[1] = scrub(args[1], fields);
      }
    } catch { /* fail open */ }
    return handler(...args);
  };
  ipc.on = (channel, listener) => { origOn.call(ipc, channel, wrapListener(listener)); };
  ipc.handle = (channel, handler) => { origHandle.call(ipc, channel, wrapHandler(handler)); };
  (ipc as unknown as Record<symbol, boolean>)[WRAPPED] = true;
  return {
    uninstall: () => {
      ipc.on = origOn;
      ipc.handle = origHandle;
      Reflect.deleteProperty(ipc, WRAPPED);
    },
  };
}

function isAdContext(payload: unknown, signatures: string[]): boolean {
  if (typeof payload === 'string') return signatures.some((s) => payload.includes(s));
  if (payload && typeof payload === 'object') {
    try { const s = JSON.stringify(payload); return signatures.some((sig) => s.includes(sig)); } catch { return false; }
  }
  return false;
}

function scrub(payload: unknown, fields: string[]): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = Array.isArray(payload) ? [...(payload as unknown[])] : { ...(payload as Record<string, unknown>) };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(clone, f)) (clone as Record<string, unknown>)[f] = '[redacted]';
  }
  return clone;
}
