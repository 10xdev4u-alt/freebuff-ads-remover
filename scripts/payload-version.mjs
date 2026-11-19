#!/usr/bin/env node
/**
 * Resolves the Freebuff payload version.
 *
 *   node scripts/payload-version.mjs                  # newest receipt, else latest
 *   node scripts/payload-version.mjs <resources-dir>  # read the payload itself
 *   node scripts/payload-version.mjs --version 0.0.204
 *   node scripts/payload-version.mjs --json [resources-dir]
 *
 * Text output is "<name> <version>" so callers can read both fields. When a
 * resources dir is given it is authoritative: the script exits 1 rather than
 * reporting some other payload's version.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const requested = get('--version');
const jsonMode = args.includes('--json');
const resourcesDir = args.find(
  (a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1] === '--version'),
);

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

/** Reads "<name> <version>" out of a payload resources dir, or null. */
function fromResources(dir) {
  if (!dir || !fs.existsSync(dir)) return null;

  const plain = path.join(dir, 'package.json');
  if (fs.existsSync(plain)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(plain, 'utf8'));
      if (pkg.version) return { name: String(pkg.name || 'freebuff'), version: String(pkg.version) };
    } catch { /* fall through to the packed payload */ }
  }

  const asarPath = path.join(dir, 'app.asar');
  if (fs.existsSync(asarPath)) {
    try {
      const { extractFile } = require('@electron/asar');
      const pkg = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
      if (pkg.version) return { name: String(pkg.name || 'freebuff'), version: String(pkg.version) };
    } catch { /* unreadable archive */ }
  }
  return null;
}

let resolved;
if (resourcesDir) {
  const payload = fromResources(resourcesDir);
  if (!payload) {
    console.error(`payload-version: no readable version in ${resourcesDir}`);
    process.exit(1);
  }
  resolved = { ...payload, source: 'payload' };
} else if (requested) {
  resolved = { name: 'freebuff', version: requested, source: 'explicit' };
} else {
  const receipts = walk('receipts')
    .filter((f) => !f.includes(`${path.sep}dry-run${path.sep}`))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
    })
    .filter((r) => r && r.payloadVersion)
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const version = receipts.length > 0 ? receipts[0].payloadVersion : 'latest';
  resolved = { name: 'freebuff', version, source: receipts.length > 0 ? 'receipt' : 'latest' };
}

if (jsonMode) console.log(JSON.stringify(resolved));
else console.log(`${resolved.name} ${resolved.version}`);
