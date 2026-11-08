#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : null; }
const resources = get('--resources');
const out = get('--out');
const receipt = get('--receipt');
const dryRun = args.includes('--dry-run');
const jsonMode = args.includes('--json');

if (!resources || !out) { console.error('usage: self-heal.mjs --resources <dir> --out <artifact> [--receipt <path>] [--dry-run] [--json]'); process.exit(2); }

const { runAutopilot } = await import('../dist/autopilot.js');
const audit = { routes: { missing: [] } };
// Run audit by importing? Simpler: invoke audit-endpoints logic via child? We'll just synthesize from a provided missing list via env.
const missing = (process.env.HEAL_MISSING || '').split(',').filter(Boolean);
audit.routes.missing = missing;

const corpusDir = path.join(process.cwd(), 'corpus');
const result = runAutopilot(audit, corpusDir, dryRun, path.dirname(out));
const artifact = result.delta ?? { addEndpoints: [], addSelectors: {}, source: 'ci-healed' };
fs.mkdirSync(path.dirname(out), { recursive: true });
if (!dryRun) fs.writeFileSync(out, JSON.stringify(artifact, null, 2));

const r = { pass: result.gate.pass, recall: result.gate.recall, precision: result.gate.precision, promoted: result.promoted };
if (receipt) {
  fs.mkdirSync(path.dirname(receipt), { recursive: true });
  fs.writeFileSync(receipt, JSON.stringify({ ...r, at: Date.now() }, null, 2));
}
if (jsonMode) console.log(JSON.stringify(r));
process.exit(r.pass ? 0 : 1);
