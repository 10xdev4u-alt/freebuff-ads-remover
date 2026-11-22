#!/usr/bin/env node
// Publish the newest passing live-e2e receipt to the live-proof page.
// Filename order is not chronological order, and an unverified receipt must
// never be published as proof.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const receiptsDir = get('--receipts') || 'receipts';
const out = get('--out') || 'live-proof/index.html';

const files = fs.existsSync(receiptsDir)
  ? fs.readdirSync(receiptsDir).filter((f) => f.startsWith('live-') && f.endsWith('.json'))
  : [];
const receipts = files
  .map((f) => {
    try { return { file: f, ...JSON.parse(fs.readFileSync(path.join(receiptsDir, f), 'utf8')) }; }
    catch { return null; }
  })
  .filter((r) => r && r.pass === true && r.provenance === 'live-e2e');
receipts.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
const latest = receipts[0];
if (!latest) { console.error('no passing live-e2e receipt'); process.exit(1); }
const { file, ...receipt } = latest;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, '<!doctype html><html><body><h1>Live proof</h1><pre>' + JSON.stringify(receipt, null, 2) + '</pre></body></html>');
console.log(JSON.stringify({ out, file, at: receipt.at, pass: receipt.pass }));
