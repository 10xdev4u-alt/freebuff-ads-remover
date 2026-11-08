#!/usr/bin/env node
/**
 * Resolve and download the latest Freebuff AppImage from the upstream GitHub
 * release (CodebuffAI/codebuff-community). Exits non-zero (and prints a clear
 * error) on any failure — never silently skips.
 *
 * Usage:
 *   node scripts/fetch-latest-appimage.mjs [--check] [--version <v>] [--out <path>]
 *
 *   --check     print the latest version and exit without downloading
 *   --version   pin a specific version (e.g. 0.0.201)
 *   --out       output path (default: ./freebuff-<version>.AppImage)
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
function getFlag(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const checkOnly = args.includes('--check');
const jsonMode = args.includes('--json');
const pinned = getFlag('--version');
const outArg = getFlag('--out');

const REPO = 'CodebuffAI/codebuff-community';
const TAG_PREFIX = 'freebuff-desktop-';

function latestTag() {
  if (pinned) return `${TAG_PREFIX}${pinned}`;
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', `https://github.com/${REPO}.git`, `refs/tags/${TAG_PREFIX}*`], { encoding: 'utf8' });
  const tags = out.trim().split('\n').filter(Boolean).map((l) => l.split(/\s+/)[1].replace('refs/tags/', ''));
  if (tags.length === 0) throw new Error('no freebuff-desktop tags found');
  // semver sort
  tags.sort((a, b) => {
    const va = a.replace(TAG_PREFIX, '').split('.').map(Number);
    const vb = b.replace(TAG_PREFIX, '').split('.').map(Number);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
      const x = va[i] || 0, y = vb[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  });
  return tags[tags.length - 1];
}

const tag = latestTag();
const version = tag.replace(TAG_PREFIX, '');
if (!jsonMode) console.log('Latest version:', version);

// Fetch release metadata via GitHub API (unauthenticated, 60 req/hr).
const apiRes = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`);
if (!apiRes.ok) {
  console.error(`GitHub API returned ${apiRes.status} for ${tag}`);
  process.exit(1);
}
const release = await apiRes.json();

// Find the .yml update manifest and the AppImage asset.
const ymlAsset = release.assets.find((a) => a.name.endsWith('-linux-x64.yml'));
const appImageAsset = release.assets.find((a) => a.name.endsWith('.AppImage') && /x86_64|x64/.test(a.name)) || release.assets.find((a) => a.name.endsWith('.AppImage'));
if (!appImageAsset) {
  console.error('No AppImage asset in release');
  process.exit(1);
}

let expectedSha512 = null;
let manifestPath = null;
if (ymlAsset) {
  const ymlRes = await fetch(ymlAsset.browser_download_url);
  const yml = await ymlRes.text();
  const m = yml.match(/sha512:\s*(.+)/);
  if (m) expectedSha512 = m[1].trim();
  const p = yml.match(/path:\s*(.+)/);
  if (p) manifestPath = p[1].trim();
  if (!jsonMode) console.log('Manifest path:', manifestPath);
}

if (!jsonMode) console.log('Downloading:', appImageAsset.browser_download_url);
if (!jsonMode) console.log('Size:', appImageAsset.size);

if (checkOnly) {
  console.log(JSON.stringify({ version, tag, url: appImageAsset.browser_download_url, size: appImageAsset.size, sha512: expectedSha512 }));
  process.exit(0);
}

const out = resolve(outArg || `freebuff-${version}.AppImage`);
mkdirSync(dirname(out), { recursive: true });

const dl = await fetch(appImageAsset.browser_download_url);
if (!dl.ok) {
  console.error(`Download failed: ${dl.status}`);
  process.exit(1);
}
await pipeline(dl.body, createWriteStream(out));

// Verify sha512 if available.
if (expectedSha512) {
  const hash = createHash('sha512');
  hash.update(readFileSync(out));
  const actual = hash.digest('base64');
  if (actual !== expectedSha512) {
    console.error(`SHA512 mismatch: expected ${expectedSha512}, got ${actual}`);
    process.exit(1);
  }
  console.log('SHA512 verified:', actual);
} else {
  console.warn('No sha512 in manifest; skipping verification');
}

console.log('Saved to:', out);
process.exit(0);
