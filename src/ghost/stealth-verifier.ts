/**
 * Stealth verifier: compares observable state to a no-ad baseline.
 */
export interface ObservableState {
  markers: string[];
  globals: string[];
  ipcCount: number;
}

export interface StealthReport {
  markersStripped: number;
  globalsErased: number;
  ipcScrubbed: number;
  delta: string[];
  pass: boolean;
}

export function verifyStealth(before: ObservableState, after: ObservableState, baseline: ObservableState): StealthReport {
  const markersStripped = before.markers.length - after.markers.length;
  const globalsErased = before.globals.length - after.globals.length;
  const ipcScrubbed = before.ipcCount - after.ipcCount;
  const delta: string[] = [];
  for (const m of after.markers) if (baseline.markers.indexOf(m) === -1) delta.push('marker:' + m);
  for (const g of after.globals) if (baseline.globals.indexOf(g) === -1) delta.push('global:' + g);
  const pass = after.markers.length <= baseline.markers.length && after.globals.length <= baseline.globals.length;
  return { markersStripped, globalsErased, ipcScrubbed, delta, pass };
}
