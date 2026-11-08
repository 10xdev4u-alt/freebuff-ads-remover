import { loadCorpus } from './corpus.js';
import type { RuleDelta } from './rule-registry.js';
import { RuleRegistry } from './rule-registry.js';
import { AdInterceptor } from './interceptor.js';
import { Logger } from './logger.js';
import { DEFAULT_CONFIG } from './types.js';

export interface DeltaGateFloors { recall: number; precision: number }

export function verifyDelta(
  delta: RuleDelta,
  registry: RuleRegistry,
  corpusDir: string,
  floors: DeltaGateFloors = { recall: 0.99, precision: 1.0 },
): { pass: boolean; reason: string | undefined; recall: number; precision: number; missed: string[]; fps: string[] } {
  const { entries } = loadCorpus(corpusDir);

  // Apply delta to a candidate registry (clone).
  const candidate = new RuleRegistry(registry.current());
  candidate.apply(delta);

  const logger = new Logger('error', false);
  const interceptor = new AdInterceptor(DEFAULT_CONFIG, logger, undefined, undefined, candidate);
  interceptor.activate();

  const goldenAds = entries.filter((e) => e.label === 'ad');
  const goldenControls = entries.filter((e) => e.label === 'control');

  let adsBlocked = 0;
  const missed: string[] = [];
  for (const e of goldenAds) {
    const url = 'https://freebuff.com' + e.path;
    const res = interceptor.intercept(url, 'GET');
    if (res.blocked) adsBlocked++; else missed.push(e.path);
  }
  let controlsAllowed = 0;
  const fps: string[] = [];
  for (const e of goldenControls) {
    const url = 'https://freebuff.com' + e.path;
    const res = interceptor.intercept(url, 'GET');
    if (res.blocked) fps.push(e.path); else controlsAllowed++;
  }

  const recall = goldenAds.length > 0 ? adsBlocked / goldenAds.length : 1;
  const precision = goldenControls.length > 0 ? controlsAllowed / goldenControls.length : 1;
  const pass = recall >= floors.recall && precision >= floors.precision && missed.length === 0 && fps.length === 0;

  let reason: string | undefined;
  if (missed.length > 0) reason = 'missed-golden-ads';
  else if (fps.length > 0) reason = 'control-false-positive';

  return { pass, reason, recall, precision, missed, fps };
}
