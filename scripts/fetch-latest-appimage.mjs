#!/usr/bin/env node
/**
 * Resolve and download the latest Freebuff AppImage from the upstream update feed.
 * Exits non-zero (and prints a clear error) on any failure — never silently skips.
 *
 * Usage: node scripts/fetch-latest-appimage.mjs [--out <path>]
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';

const out = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : join(process.cwd(), 'freebuff-latest.AppImage'));

const FEED = 'https://freebuff.com/api/desktop/updates/linux-x64/';
const res = await fetch(FEED);
if (!res.ok) {
  console.error(`Update feed returned ${res.status}: ${FEED}`);
  process.exit(1);
}
const meta = await res.json();
const url = meta?.url || meta?.downloadUrl || meta?.path;
if (!url) {
  console.error('Update feed did not include a download URL. Feed shape changed?');
  console.error(JSON.stringify(meta));
  process.exit(1);
}
const fullUrl = url.startsWith('http') ? url : new URL(url, FEED).href;
console.log('Latest version:', meta?.version ?? 'unknown');
console.log('Downloading:', fullUrl);

mkdirSync(dirname(out), { recursive: true });
const dl = await fetch(fullUrl);
if (!dl.ok) {
  console.error(`Download failed: ${dl.status}`);
  process.exit(1);
}
await pipeline(dl.body, createWriteStream(out));

// Verify sha256 if provided
if (meta?.sha256 || meta?.sha256Hash) {
  const hash = createHash('sha256');
  const { readFileSync } = await import('node:fs');
  hash.update(readFileSync(out));
  const actual = hash.digest('hex');
  const expected = meta.sha256 || meta.sha256Hash;
  if (actual !== expected) {
    console.error(`SHA256 mismatch: expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log('SHA256 verified:', actual);
}
console.log('Saved to:', out);
process.exit(0);
