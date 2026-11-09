#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const requested = get('--version');
const jsonMode = args.includes('--json');

function walk(d) {
  if (!fs.existsSync(d)) return [];
  const out = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else if (e.name.endsWith('.json')) out.push(f);
  }
  return out;
}

let version = requested || null;
let source = requested ? 'explicit' : 'none';

if (!version) {
  const receipts = walk('receipts')
    .filter((f) => !f.includes(`${path.sep}dry-run${path.sep}`))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
    })
    .filter((r) => r && r.payloadVersion)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (receipts.length > 0) {
    version = receipts[0].payloadVersion;
    source = 'receipt';
  } else {
    version = 'latest';
    source = 'latest';
  }
}

if (jsonMode) console.log(JSON.stringify({ version, source }));
else console.log(version);
