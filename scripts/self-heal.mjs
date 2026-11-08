#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : null; }
const resources = get('--resources');
const out = get('--out');
const receiptPath = get('--receipt');
const dryRun = args.includes('--dry-run');
const jsonMode = args.includes('--json');
const genRulesExisting = get('--existing') || (out && fs.existsSync(out) ? out : null);

if (!resources || !out) {
  console.error('usage: self-heal.mjs --resources <dir> --out <artifact> [--receipt <path>] [--existing <artifact>] [--dry-run] [--json]');
  process.exit(2);
}

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const corpusDir = path.join(repoRoot, 'corpus');

// 1. Run the audit (shared heuristics).
let auditJson;
try {
  const cmd = `node scripts/audit-endpoints.mjs ${JSON.stringify(resources)} --json${genRulesExisting ? ` --generated-rules=${genRulesExisting}` : ''}`;
  const raw = execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
  auditJson = JSON.parse(raw);
} catch (e) {
  // audit exits 1 when gaps exist; parse stdout from error
  const raw = (e.stdout || '').toString();
  try { auditJson = JSON.parse(raw); } catch { console.error('audit failed:', e.message); process.exit(1); }
}

const missing = (auditJson.routes?.missing ?? []).map((r) => ({ route: r }));

// 2. Load existing artifact for cumulative merge.
let existing = null;
if (genRulesExisting && fs.existsSync(genRulesExisting)) {
  try { existing = JSON.parse(fs.readFileSync(genRulesExisting, 'utf8')); } catch { existing = null; }
}

// 3. Synthesize + gate via autopilot (load existing into registry first).
const { runAutopilot } = await import(path.join(repoRoot, 'dist', 'autopilot.js'));
const configDir = path.join(repoRoot, '.heal-tmp');
fs.mkdirSync(configDir, { recursive: true });
// seed registry with existing artifact
if (existing) {
  const { RuleRegistry } = await import(path.join(repoRoot, 'dist', 'rule-registry.js'));
  const r = new RuleRegistry();
  r.apply(existing);
  fs.writeFileSync(path.join(configDir, 'rules.json'), JSON.stringify(r.current(), null, 2));
}

const result = runAutopilot({ routes: { missing: missing.map((m) => m.route) } }, corpusDir, true, configDir);

// 4. Build cumulative delta.
const newDelta = result.delta || { addEndpoints: [], addSelectors: {}, source: 'ci-healed' };
const merged = {
  addEndpoints: [...new Set([...(existing?.addEndpoints ?? []), ...(newDelta.addEndpoints ?? [])])],
  addSelectors: { ...(existing?.addSelectors ?? {}), ...(newDelta.addSelectors ?? {}) },
  source: `ci-healed:${auditJson.freebuffVersion ?? 'unknown'}`,
};

// 5. maxPromotedRules guard.
const max = 25;
if (merged.addEndpoints.length > max) {
  console.error(`maxPromotedRules exceeded: ${merged.addEndpoints.length} > ${max}`);
  process.exit(1);
}

// 6. Write artifact + receipt only on pass.
const gate = result.gate;
const pass = gate.pass && (gate.recall ?? 1) >= 0.99 && (gate.precision ?? 1) === 1;

const corpusHash = 'sha256:' + createHash('sha256').update(fs.readFileSync(path.join(corpusDir, 'golden.jsonl'))).digest('hex');
const artifactHash = 'sha256:' + createHash('sha256').update(JSON.stringify(merged)).digest('hex');

const receipt = {
  version: '1.5.2',
  payloadVersion: auditJson.freebuffVersion ?? null,
  corpusHash,
  artifactHash,
  addedEndpoints: newDelta.addEndpoints ?? [],
  addedSelectors: newDelta.addSelectors ?? {},
  gate: { pass, recall: gate.recall, precision: gate.precision, missed: gate.missed ?? [], fps: gate.fps ?? [] },
  domGaps: auditJson.dom?.gaps ?? [],
  at: new Date().toISOString(),
};

if (jsonMode) console.log(JSON.stringify({ pass, ...receipt }, null, 2));

if (!pass) {
  console.error('self-heal gate failed:', JSON.stringify(receipt.gate));
  if (receiptPath) { fs.mkdirSync(path.dirname(receiptPath), { recursive: true }); fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2)); }
  process.exit(1);
}

if (!dryRun) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(merged, null, 2));
  if (receiptPath) {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  }
}

// cleanup
try { fs.rmSync(configDir, { recursive: true, force: true }); } catch {}
process.exit(0);
