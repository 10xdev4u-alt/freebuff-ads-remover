#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { verifyManifest } from '../dist/feed.js';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const source = get('--manifest') || get('--url') || get('--file');
const configDir = get('--config-dir');
const publicKey = get('--public-key') || process.env.FEED_PUBLIC_KEY;
const killSwitch = process.env.FREEBUFF_FEED_KILL_SWITCH === 'true';
const previousPublicKey = process.env.FEED_PREVIOUS_PUBLIC_KEY || '';
if (!source || !configDir || !publicKey) {
  console.error('usage: feed-sync.mjs --manifest <file|url> --config-dir <dir> [--public-key <pem>]');
  process.exit(2);
}
const dir = configDir;
fs.mkdirSync(dir, { recursive: true });
const statePath = path.join(dir, 'feed-state.json');
let state = {};
try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch {}

async function loadManifest() {
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(source, 'utf8'));
}

const manifest = await loadManifest();
if (!verifyManifest(manifest, publicKey, previousPublicKey)) {
  console.error('feed manifest signature invalid');
  process.exit(1);
}
const version = Number(manifest.version ?? 0);
if (state.version && version <= state.version && !manifest.rollbackTo) {
  console.log(JSON.stringify({ status: 'up-to-date', version }));
  process.exit(0);
}
if (manifest.rollbackTo) {
  const lastGood = path.join(dir, 'feed-rules.last-good.json');
  if (fs.existsSync(lastGood)) {
    fs.copyFileSync(lastGood, path.join(dir, 'feed-rules.json'));
  } else {
    try { fs.unlinkSync(path.join(dir, 'feed-rules.json')); } catch {}
  }
  fs.writeFileSync(statePath, JSON.stringify({ version, rolledBack: true, at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ status: 'rolled-back', to: manifest.rollbackTo }));
  process.exit(0);
}
if (killSwitch) { console.log(JSON.stringify({ status: 'kill-switch' })); process.exit(0); }
// materialize last-good before overwriting
const feedRulesPath = path.join(dir, 'feed-rules.json');
if (fs.existsSync(feedRulesPath)) {
  fs.copyFileSync(feedRulesPath, path.join(dir, 'feed-rules.last-good.json'));
}
const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
const merged = {
  addEndpoints: [...new Set(entries.flatMap((e) => e.rules?.addEndpoints ?? []))],
  addSelectors: Object.assign({}, ...entries.map((e) => e.rules?.addSelectors ?? {})),
  source: `feed:${entries.map((e) => e.healHash).join(',')}`,
  healHash: entries.map((e) => e.healHash).join(','),
};
fs.writeFileSync(feedRulesPath, JSON.stringify(merged, null, 2));
fs.writeFileSync(statePath, JSON.stringify({ version, at: new Date().toISOString() }, null, 2));
fs.writeFileSync(path.join(dir, 'delivery-receipt.json'), JSON.stringify({ healHash: merged.healHash, version, appliedAt: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ status: 'applied', version, entries: entries.length }));
