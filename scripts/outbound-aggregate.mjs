#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const input = get('--input') || get('--outcomes');
const out = get('--out') || 'outbound/summary.json';

let raw = '';
if (input && fs.existsSync(input)) raw = fs.readFileSync(input, 'utf8');
else raw = fs.readFileSync(0, 'utf8');
let data;
try { data = JSON.parse(raw); } catch { console.error('bad json'); process.exit(2); }
const rows = Array.isArray(data) ? data : (data.envelopes ?? data.rows ?? []);

const byHash = new Map();
for (const r of rows) {
  if (!r || typeof r.healHash !== 'string') continue;
  if (!byHash.has(r.healHash)) byHash.set(r.healHash, { healHash: r.healHash, total: 0, suppressed: 0, routes: new Set() });
  const g = byHash.get(r.healHash);
  g.total++;
  if (r.suppressed) g.suppressed++;
  g.routes.add(r.route);
}
const summary = {
  generatedAt: new Date().toISOString(),
  heals: [...byHash.values()].map((g) => ({
    healHash: g.healHash,
    total: g.total,
    suppressed: g.suppressed,
    suppressionRate: g.total ? g.suppressed / g.total : 0,
    routes: [...g.routes],
  })),
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ heals: summary.heals.length }));
