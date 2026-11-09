#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { signManifest, keyHash } from '../dist/feed.js';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const input = get('--in');
const output = get('--out') || input;
const key = get('--key') || process.env.FEED_SIGNING_KEY;
if (!input || !key) {
  console.error('usage: feed-sign.mjs --in <manifest> [--out <path>] [--key <secret>]');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
const { sig: _sig, ...rest } = manifest;
const signed = { ...rest, sig: signManifest(rest, key) };
fs.writeFileSync(output, JSON.stringify(signed, null, 2) + '\n');
console.log(JSON.stringify({ signed: output, keyHash: keyHash(key) }));
