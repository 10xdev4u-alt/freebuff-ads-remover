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
const markdownPath = get('--markdown');
const dryRun = args.includes('--dry-run');
const jsonMode = args.includes('--json');
const genRulesExisting = get('--existing') || (out && fs.existsSync(out) ? out : null);
const maxPromoted = parseInt(get('--max-promoted-rules') || '25', 10);
const controlRoutes = (get('--control-routes') || '/healthz,/api/account/usage').split(',').map((x) => x.trim()).filter(Boolean);
const payloadVersionOverride = get('--payload-version');
const candidatesPath = get('--candidates');
const provenance = get('--provenance') || (process.env.GITHUB_ACTIONS === 'true' ? 'machine' : 'manual');

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

// Refresh corpus from the payload before healing (differential gate).
const payloadVersion = payloadVersionOverride || auditJson.freebuffVersion || null;
if (payloadVersion) {
  try {
    execSync(`node scripts/update-corpus.mjs --resources "${resources}" --version "${payloadVersion}"`, { cwd: repoRoot, stdio: 'pipe' });
  } catch (e) {
    console.error('corpus refresh failed:', e.message);
    process.exit(1);
  }
}

const missing = (auditJson.routes?.missing ?? []).map((r) => (typeof r === 'string' ? r : r.route)).filter(Boolean);
if (candidatesPath && fs.existsSync(candidatesPath)) {
  try {
    const c = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
    for (const cand of (c.candidates ?? [])) { if (cand.route && !missing.includes(cand.route)) missing.push(cand.route); }
  } catch { /* ignore */ }
}

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

const result = runAutopilot({ routes: { missing } }, corpusDir, true, configDir);

// 4. Build cumulative delta.
const newDelta = result.delta || { addEndpoints: [], addSelectors: {}, source: 'ci-healed' };
const merged = {
  addEndpoints: [...new Set([...(existing?.addEndpoints ?? []), ...(newDelta.addEndpoints ?? [])])],
  addSelectors: { ...(existing?.addSelectors ?? {}), ...(newDelta.addSelectors ?? {}) },
  source: `ci-healed:${auditJson.freebuffVersion ?? 'unknown'}`,
};

// 4b. control-route rejection.
for (const r of merged.addEndpoints) {
  if (controlRoutes.includes(r)) { console.error('control route in delta:', r); process.exit(1); }
  const segs = r.toLowerCase().split('/').map((seg) => seg.split('?')[0]).filter(Boolean);
  if (segs.some((seg) => ['admission','threads','thread','reload','profile','survey-events'].includes(seg))) { console.error('protected segment in delta:', r); process.exit(1); }
}
// 5. maxPromotedRules guard.
if (merged.addEndpoints.length > maxPromoted) {
  console.error(`maxPromotedRules exceeded: ${merged.addEndpoints.length} > ${maxPromoted}`);
  process.exit(1);
}

// 6. Write artifact + receipt only on pass.
const gate = result.gate;
const pass = gate.pass && (gate.recall ?? 1) >= 0.99 && (gate.precision ?? 1) === 1;

const corpusHash = 'sha256:' + createHash('sha256').update(fs.readFileSync(path.join(corpusDir, 'golden.jsonl'))).digest('hex');
const artifactText = JSON.stringify(merged, null, 2);
const artifactHash = 'sha256:' + createHash('sha256').update(artifactText).digest('hex');

const receipt = {
  version: JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version,
  payloadVersion: payloadVersionOverride || auditJson.freebuffVersion || null,
  corpusHash,
  artifactHash,
  addedEndpoints: newDelta.addEndpoints ?? [],
  addedSelectors: newDelta.addSelectors ?? {},
  gate: { pass, recall: gate.recall, precision: gate.precision, missed: gate.missed ?? [], fps: gate.fps ?? [] },
  domGaps: auditJson.dom?.gaps ?? [],
  provenance,
  at: new Date().toISOString(),
};

if (jsonMode) console.log(JSON.stringify({ pass, ...receipt }, null, 2));

if (!pass) {
  console.error('self-heal gate failed:', JSON.stringify(receipt.gate));
  if (receiptPath) { fs.mkdirSync(path.dirname(receiptPath), { recursive: true }); fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2)); }
  process.exit(1);
}

const markdown = `# Heal receipt

- **version:** ${receipt.version}
- **payloadVersion:** ${receipt.payloadVersion}
- **corpusHash:** ${receipt.corpusHash}
- **artifactHash:** ${receipt.artifactHash}
- **gate:** pass=${receipt.gate.pass} recall=${receipt.gate.recall} precision=${receipt.gate.precision} missed=${receipt.gate.missed.length} fps=${receipt.gate.fps.length}
- **addedEndpoints:** ${receipt.addedEndpoints.join(', ') || '(none)'}
- **addedSelectors:** ${Object.keys(receipt.addedSelectors).length}
- **domGaps:** ${receipt.domGaps.join(', ') || '(none)'}
- **at:** ${receipt.at}
`;
if (!dryRun) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, artifactText);
  // update payload-drift baseline
  try {
    const classifications = auditJson.routes?.classifications ?? {};
    const baseline = {
      version: 1,
      generatedAt: new Date().toISOString(),
      payloadVersion: receipt.payloadVersion,
      routes: Object.keys(classifications),
      classifications,
    };
    const baselinePath = path.join(path.dirname(out), 'endpoint-baseline.json');
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  } catch { /* fail open */ }
  if (receiptPath) {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  }
  if (markdownPath) {
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, markdown);
  }
}
// always write markdown if requested (even dry-run) for CI body
if (dryRun && markdownPath) {
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, markdown);
}


// cleanup
try { fs.rmSync(configDir, { recursive: true, force: true }); } catch {}
process.exit(0);
