/**
 * Offline replay engine for Shadow Replay.
 * Pure: takes capture entries + a matcher → report. No Electron, no IO.
 */
import type { ShadowEntry } from './shadow-capture.js';

export interface ReplayMatcher {
  /** Returns true if the URL/path should be blocked. */
  isBlocked(path: string): boolean;
  endpoints: number;
}

export interface ReplayReport {
  capture: { entries: number; ads: number; controls: number };
  candidate: { endpoints: number };
  recall: number;
  precision: number;
  falsePositives: { path: string; count: number }[];
  missedAds: { path: string; count: number }[];
  pass: boolean;
}

export function replay(entries: ShadowEntry[], matcher: ReplayMatcher, opts?: { recallFloor?: number; precisionFloor?: number }): ReplayReport {
  const recallFloor = opts?.recallFloor ?? 0.99;
  const precisionFloor = opts?.precisionFloor ?? 1.0;

  let ads = 0, controls = 0, adsBlocked = 0, controlsAllowed = 0;
  const fpMap = new Map<string, number>();
  const missMap = new Map<string, number>();

  for (const e of entries) {
    const wasAd = e.decision.blocked;
    const candidateBlocks = matcher.isBlocked(e.path);
    if (wasAd) {
      ads++;
      if (candidateBlocks) adsBlocked++;
      else missMap.set(e.path, (missMap.get(e.path) || 0) + 1);
    } else {
      // control (or unknown). Treat as control for precision if in allowlist or not blocked originally.
      controls++;
      if (!candidateBlocks) controlsAllowed++;
      else fpMap.set(e.path, (fpMap.get(e.path) || 0) + 1);
    }
  }

  const recall = ads > 0 ? adsBlocked / ads : 1;
  const precision = controls > 0 ? controlsAllowed / controls : 1;

  const falsePositives = [...fpMap.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count);
  const missedAds = [...missMap.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count);

  const pass = precision >= precisionFloor && recall >= recallFloor;
  return {
    capture: { entries: entries.length, ads, controls },
    candidate: { endpoints: matcher.endpoints },
    recall,
    precision,
    falsePositives,
    missedAds,
    pass,
  };
}
