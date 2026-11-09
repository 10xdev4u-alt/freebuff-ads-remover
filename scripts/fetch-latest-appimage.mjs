#!/usr/bin/env node
/**
 * Resolve and download the latest Freebuff AppImage from the upstream GitHub
 * release (CodebuffAI/codebuff-community). Exits non-zero (and prints a clear
 * error) on any failure — never silently skips.
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
const resolveOnly = args.includes('--resolve');
const fallbackLatest = args.includes('--fallback-latest');
const pinned = getFlag('--version');
const outArg = getFlag('--out');
const tokenFlag = getFlag('--token');

const REPO = 'CodebuffAI/codebuff-community';
const TAG_PREFIX = 'freebuff-desktop-v';

export function normalizeVersion(v) {
  return String(v ?? '').trim().replace(/^v/, '');
}

export function compareVersions(a, b) {
  const pa = normalizeVersion(a).split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function authHeaders() {
  const token = tokenFlag || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const err = new Error(`GitHub API returned ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function latestTagFromRemote() {
  const out = execFileSync('git', ['ls-remote', '--tags', '--refs', `https://github.com/${REPO}.git`, `refs/tags/${TAG_PREFIX}*`], { encoding: 'utf8' });
  const tags = out.trim().split('\n').filter(Boolean).map((l) => l.split(/\s+/)[1].replace('refs/tags/', ''));
  if (tags.length === 0) throw new Error('no freebuff-desktop tags found');
  tags.sort((a, b) => compareVersions(a.replace(TAG_PREFIX, ''), b.replace(TAG_PREFIX, '')));
  return tags[tags.length - 1];
}

async function resolveRelease(requestedVersion, allowFallback) {
  let tag;
  let fallback = false;
  if (requestedVersion) {
    tag = `${TAG_PREFIX}${normalizeVersion(requestedVersion)}`;
  } else {
    tag = latestTagFromRemote();
  }

  let release;
  try {
    release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`);
  } catch (e) {
    if (allowFallback && e.status === 404) {
      tag = latestTagFromRemote();
      release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`);
      fallback = true;
    } else {
      throw e;
    }
  }

  const appImageAsset = release.assets.find((a) => a.name.endsWith('.AppImage') && /x86_64|x64/.test(a.name))
    || release.assets.find((a) => a.name.endsWith('.AppImage'));
  if (!appImageAsset) throw new Error('No AppImage asset in release');

  const ymlAsset = release.assets.find((a) => a.name.endsWith('-linux-x64.yml'));
  let expectedSha512 = null;
  let manifestPath = null;
  if (ymlAsset) {
    const ymlRes = await fetch(ymlAsset.browser_download_url, { headers: authHeaders() });
    const yml = await ymlRes.text();
    const m = yml.match(/sha512:\s*(.+)/);
    if (m) expectedSha512 = m[1].trim();
    const p = yml.match(/path:\s*(.+)/);
    if (p) manifestPath = p[1].trim();
  }

  return {
    tag,
    version: normalizeVersion(tag.replace(TAG_PREFIX, '')),
    url: appImageAsset.browser_download_url,
    size: appImageAsset.size,
    sha512: expectedSha512,
    manifestPath,
    fallback,
  };
}

async function main() {
  const requested = pinned ? normalizeVersion(pinned) : null;
  const resolved = await resolveRelease(requested, fallbackLatest);

  if (checkOnly || resolveOnly || jsonMode) {
    console.log(JSON.stringify(resolved));
  }

  if (resolveOnly || checkOnly) process.exit(0);

  if (!jsonMode) {
    console.log('Latest version:', resolved.version);
    if (resolved.manifestPath) console.log('Manifest path:', resolved.manifestPath);
    console.log('Downloading:', resolved.url);
    console.log('Size:', resolved.size);
  }

  const out = resolve(outArg || `freebuff-${resolved.version}.AppImage`);
  mkdirSync(dirname(out), { recursive: true });

  const dl = await fetch(resolved.url, { headers: authHeaders() });
  if (!dl.ok) {
    console.error(`Download failed: ${dl.status}`);
    process.exit(1);
  }
  await pipeline(dl.body, createWriteStream(out));

  if (resolved.sha512) {
    const hash = createHash('sha512');
    hash.update(readFileSync(out));
    const actual = hash.digest('base64');
    if (actual !== resolved.sha512) {
      console.error(`SHA512 mismatch: expected ${resolved.sha512}, got ${actual}`);
      process.exit(1);
    }
    if (!jsonMode) console.log('SHA512 verified:', actual);
  } else if (!jsonMode) {
    console.warn('No sha512 in manifest; skipping verification');
  }

  if (!jsonMode) console.log('Saved to:', out);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
