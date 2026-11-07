/**
 * Context-aware identifier scrubber. Chained, fast-path, never double-wraps.
 * Only mutates payloads matching an ad-context signature.
 */
export interface ScrubberConfig {
  enabled: boolean;
  preset: 'standard' | 'aggressive' | 'paranoid';
}

const WRAPPED = Symbol('ghost-wrapped');

export function isAdContext(payload: unknown, signatures: string[]): boolean {
  if (typeof payload === 'string') return signatures.some((s) => payload.includes(s));
  if (payload && typeof payload === 'object') {
    try {
      const s = JSON.stringify(payload);
      return signatures.some((sig) => s.includes(sig));
    } catch {
      return false;
    }
  }
  return false;
}

export function scrubPayload(payload: unknown, fields: string[]): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const clone = Array.isArray(payload) ? [...(payload as unknown[])] : { ...(payload as Record<string, unknown>) };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(clone, f)) {
      (clone as Record<string, unknown>)[f] = '[redacted]';
    }
  }
  return clone;
}

export function installScrubber(signatures: string[], fields: string[], host: { postMessage: (m: unknown, t?: string, tr?: Transferable[]) => void } = (globalThis as unknown as { window: { postMessage: (m: unknown, t?: string, tr?: Transferable[]) => void } }).window): { uninstall: () => void } {
  const origPostMessage = host.postMessage.bind(host);
  if ((origPostMessage as unknown as Record<symbol, boolean>)[WRAPPED]) {
    return { uninstall: () => {} };
  }
  const wrapped = function (this: Window, message: unknown, targetOrigin?: string, transfer?: Transferable[]) {
    if (isAdContext(message, signatures)) {
      message = scrubPayload(message, fields);
    }
    origPostMessage.call(this, message, targetOrigin as string, transfer);
  };
  (wrapped as unknown as Record<symbol, boolean>)[WRAPPED] = true;
  (host as { postMessage: unknown }).postMessage = wrapped;
  return {
    uninstall: () => { (host as { postMessage: unknown }).postMessage = origPostMessage; },
  };
}
