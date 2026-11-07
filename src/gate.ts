/**
 * Replay Gate: evidence-driven blocking.
 * Runs candidate rule set against golden corpus; fails on missed golden ad or control FP.
 */
import { loadCorpus } from './corpus.js';
import { AdInterceptor } from './interceptor.js';
import { loadConfig } from './config.js';
import { Logger } from './logger.js';

export interface GateReport {
  corpus: { entries: number; ads: number; controls: number; version: string };
  candidate: { endpoints: number };
  recall: number;
  precision: number;
  missedAds: string[];
  falsePositives: string[];
  pass: boolean;
  reason?: string;
}

export function runGate(corpusDir: string): GateReport {
  const { entries, manifest } = loadCorpus(corpusDir);
  const config = loadConfig();
  const logger = new Logger('error', false);
  const interceptor = new AdInterceptor(config, logger);

  const goldenAds = entries.filter((e) => e.label === 'ad');
  const goldenControls = entries.filter((e) => e.label === 'control');

  let adsBlocked = 0;
  const missed: string[] = [];
  for (const e of goldenAds) {
    if (interceptor.intercept(`https://x${e.path}`).blocked) adsBlocked++;
    else missed.push(e.path);
  }
  let controlsAllowed = 0;
  const fps: string[] = [];
  for (const e of goldenControls) {
    if (interceptor.intercept(`https://x${e.path}`).blocked) fps.push(e.path);
    else controlsAllowed++;
  }

  const recall = goldenAds.length > 0 ? adsBlocked / goldenAds.length : 1;
  const precision = goldenControls.length > 0 ? controlsAllowed / goldenControls.length : 1;
  const pass = recall >= 0.99 && precision >= 1.0 && missed.length === 0 && fps.length === 0;

  let reason: string | undefined;
  if (missed.length > 0) reason = 'missed-golden-ads';
  else if (fps.length > 0) reason = 'control-false-positive';

  return {
    corpus: { entries: entries.length, ads: goldenAds.length, controls: goldenControls.length, version: manifest.freebuffVersion },
    candidate: { endpoints: (interceptor as unknown as { patterns?: unknown[] }).patterns?.length ?? 0 },
    recall,
    precision,
    missedAds: missed,
    falsePositives: fps,
    pass,
    ...(reason ? { reason } : {}),
  };
}
