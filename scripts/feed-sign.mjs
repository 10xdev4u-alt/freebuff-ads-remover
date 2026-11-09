#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { signManifest, keyHash } from '../dist/feed.js';

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const input = get('--in');
const output = get('--out') || input;
const privateKey = get('--private-key') || process.env.FEED_SIGNING_PRIVATE_KEY;
if (!input || !privateKey) {
  console.error('usage: feed-sign.mjs --in <manifest> [--out <path>] [--private-key <pem>]');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
const { sig: _sig, ...rest } = manifest;
const signed = { ...rest, sig: signManifest(rest, privateKey) };
fs.writeFileSync(output, JSON.stringify(signed, null, 2) + '\n');
// derive public key for pinning
const pub = (await import('node:crypto')).createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
console.log(JSON.stringify({ signed: output, publicKey: pub, keyHash: keyHash(pub) }));
