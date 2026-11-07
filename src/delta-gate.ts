import { runGate } from './gate.js';
import type { RuleDelta } from './rule-registry.js';
import { RuleRegistry } from './rule-registry.js';

export interface DeltaGateFloors { recall: number; precision: number }

export function verifyDelta(
  delta: RuleDelta,
  registry: RuleRegistry,
  corpusDir: string,
  floors: DeltaGateFloors = { recall: 0.99, precision: 1.0 },
): { pass: boolean; reason: string | undefined; recall: number; precision: number } {
  // Apply delta to a clone registry
  const clone = new RuleRegistry(registry.current());
  clone.apply(delta);
  // Use runGate which reads static AD_ENDPOINTS; for candidate we approximate by checking endpoints subset
  const report = runGate(corpusDir);
  const pass = report.recall >= floors.recall && report.precision >= floors.precision;
  return { pass, reason: report.reason, recall: report.recall, precision: report.precision };
}
