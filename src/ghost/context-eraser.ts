/**
 * Teardown of ad-script residue: globals, timers, observers, styles.
 * Fail-open: each step wrapped.
 */
export interface EraseTarget {
  globals?: string[];
  timers?: number[];
  observers?: { disconnect: () => void }[];
  styles?: Element[];
}

export function eraseContext(target: EraseTarget, host: { [k: string]: unknown }): number {
  let count = 0;
  for (const g of target.globals ?? []) {
    try { Reflect.deleteProperty(host, g); count++; } catch { /* ignore */ }
  }
  for (const t of target.timers ?? []) {
    try { clearTimeout(t); clearInterval(t); count++; } catch { /* ignore */ }
  }
  for (const o of target.observers ?? []) {
    try { o.disconnect(); count++; } catch { /* ignore */ }
  }
  for (const s of target.styles ?? []) {
    try { s.remove(); count++; } catch { /* ignore */ }
  }
  return count;
}
