#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i+1] : null; }
const resources = get('--resources');
const out = get('--out') || 'corpus/golden.jsonl';
const manifestOut = get('--manifest') || 'corpus/manifest.json';
const dryRun = args.includes('--dry-run');
const version = get('--version') || '0.0.201';

if (!resources) { console.error('usage: update-corpus.mjs --resources <dir> [--version X] [--dry-run]'); process.exit(2); }

// Load existing corpus for additive-superset check
let existingAds = new Set();
let existingControls = new Set();
const corpusPath = path.resolve('corpus/golden.jsonl');
if (fs.existsSync(corpusPath)) {
  for (const line of fs.readFileSync(corpusPath,'utf8').trim().split('\n').filter(Boolean)) {
    try { const e = JSON.parse(line); if (e.label === 'ad') existingAds.add(e.path); else if (e.label === 'control') existingControls.add(e.path); } catch {}
  }
}

const CONTROL_ROUTES = ['/healthz', '/api/account/usage'];

// Walk resources for ad-shaped routes (reuse audit output if present)
let routes = [];
const auditPath = path.join(resources, '..', 'audit.json');
// Try to gather from a simple scan of js files for /api/ paths
function scan(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...scan(f));
    else if (/\.(js|mjs|cjs)$/.test(e.name)) {
      const txt = fs.readFileSync(f, 'utf8');
      const re = /["'`](\/api\/[a-zA-Z0-9_\-\/]+)["'`]/g;
      let m; while ((m = re.exec(txt))) out.push(m[1]);
    }
  }
  return out;
}
const found = [...new Set(scan(resources))];

const ads = new Set(existingAds);
const controls = new Set(CONTROL_ROUTES);
for (const r of found) {
  if (CONTROL_ROUTES.includes(r)) controls.add(r);
  else if (/ad|monet|sponsor|promo|break|billboard|impression/i.test(r)) ads.add(r);
}

// Additive superset check
for (const a of existingAds) if (!ads.has(a)) { console.error('DROPPED golden ad:', a); process.exit(1); }

const entries = [
  ...[...ads].map((p) => ({ path: p, label: 'ad', surface: 'sponsorBreak', source: `upstream-audit@${version}` })),
  ...[...controls].map((p) => ({ path: p, label: 'control', surface: null, source: `upstream-audit@${version}` })),
];

const body = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
const hash = crypto.createHash('sha256').update(body).digest('hex');

if (dryRun) {
  console.log('would write', entries.length, 'entries (ads:', ads.size, 'controls:', controls.size, ')');
  console.log('hash:', hash);
  process.exit(0);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
fs.writeFileSync(manifestOut, JSON.stringify({ version: 1, freebuffVersion: version, entries: entries.length, ads: ads.size, controls: controls.size, sha256: hash }, null, 2) + '\n');
console.log(JSON.stringify({ entries: entries.length, ads: ads.size, controls: controls.size, hash }));
