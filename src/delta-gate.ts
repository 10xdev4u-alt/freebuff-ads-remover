import { loadCorpus } from './corpus.js';
import type { RuleDelta } from './rule-registry.js';
import type { RuleRegistry } from './rule-registry.js';

export interface DeltaGateFloors { recall: number; precision: number }

export function verifyDelta(
  delta: RuleDelta,
  registry: RuleRegistry,
  corpusDir: string,
  floors: DeltaGateFloors = { recall: 0.99, precision: 1.0 },
): { pass: boolean; reason: string | undefined; recall: number; precision: number } {
  const { entries } = loadCorpus(corpusDir);
  const base = new Set(registry.current().endpoints);
  const candidateEndpoints = new Set(base);
  for (const e of delta.addEndpoints) candidateEndpoints.add(e);

  const goldenAds = entries.filter((e) => e.label === 'ad');
  const goldenControls = entries.filter((e) => e.label === 'control');

  let adsBlocked = 0;
  const missed: string[] = [];
  for (const e of goldenAds) {
    const path = e.path;
    const blocked = [...candidateEndpoints].some((p) => path.includes(p) || p.includes(path));
    if (blocked) adsBlocked++; else missed.push(path);
  }
  let controlsAllowed = 0;
  const fps: string[] = [];
  for (const e of goldenControls) {
    const path = e.path;
    const blocked = [...candidateEndpoints].some((p) => path.includes(p) || p.includes(path));
    if (blocked) fps.push(path); else controlsAllowed++;
  }

  const recall = goldenAds.length > 0 ? adsBlocked / goldenAds.length : 1;
  const precision = goldenControls.length > 0 ? controlsAllowed / goldenControls.length : 1;
  const pass = recall >= floors.recall && precision >= floors.precision && missed.length === 0 && fps.length === 0;

  let reason: string | undefined;
  if (missed.length > 0) reason = 'missed-golden-ads';
  else if (fps.length > 0) reason = 'control-false-positive';

  return { pass, reason, recall, precision };
}
