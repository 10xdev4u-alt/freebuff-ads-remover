import { synthesizeDelta } from './rule-synthesis.js';
import { verifyDelta } from './delta-gate.js';
import { RuleRegistry } from './rule-registry.js';
import { getConfigDir } from './config.js';

export interface AutopilotResult { delta: unknown; gate: { pass: boolean; recall: number; precision: number }; promoted: boolean }

export function runAutopilot(
  audit: { routes?: { missing?: string[] } },
  corpusDir: string,
  dryRun: boolean,
  configDir?: string,
): AutopilotResult {
  const dir = configDir || getConfigDir();
  const gaps = (audit.routes?.missing ?? []).map((r: string) => ({ route: r }));
  const delta = synthesizeDelta(gaps, 'audit');
  const registry = RuleRegistry.load(dir) ?? new RuleRegistry();
  const gate = delta ? verifyDelta(delta, registry, corpusDir) : { pass: true, reason: undefined, recall: 1, precision: 1 };
  let promoted = false;
  if (delta && gate.pass && !dryRun) {
    registry.apply(delta);
    registry.save(dir);
    promoted = true;
  }
  return { delta, gate: { pass: gate.pass, recall: gate.recall, precision: gate.precision }, promoted };
}
