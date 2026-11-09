#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const artifactPath = get('--artifact') || 'config/generated-rules.json';
const receiptsDir = get('--receipts') || 'receipts';
const out = get('--out') || 'feed/manifest.json';
const version = get('--version') || '1';

let artifact = { addEndpoints: [], addSelectors: {} };
try { artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')); } catch {}

const receipts = fs.existsSync(receiptsDir)
  ? fs.readdirSync(receiptsDir).filter((f) => f.endsWith('.json')).map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(receiptsDir, f), 'utf8')); } catch { return null; }
    }).filter(Boolean)
  : [];
const crypto = await import('node:crypto');
const artifactText = fs.readFileSync(artifactPath, 'utf8');
const artifactHash = 'sha256:' + crypto.createHash('sha256').update(artifactText).digest('hex');
let latest = receipts.find((r) => r.artifactHash === artifactHash);
if (!latest) latest = receipts.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))[0];
if (!latest || !latest.artifactHash) { console.error('no valid receipt'); process.exit(1); }

const manifest = {
  version: Number(version),
  generatedAt: new Date().toISOString(),
  entries: [{
    healHash: latest.artifactHash,
    rules: {
      addEndpoints: artifact.addEndpoints ?? [],
      addSelectors: artifact.addSelectors ?? {},
      source: artifact.source ?? 'feed',
    },
    route: null,
  }],
  rollbackTo: null,
};
if (!manifest.entries[0].healHash || manifest.entries[0].healHash === 'unknown') { console.error('refuse unknown healHash'); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ out, version: manifest.version, healHash: manifest.entries[0].healHash }));
