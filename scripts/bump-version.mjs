#!/usr/bin/env node
// Applies one release bump to every coupled version surface and records the cut
// in release/last-cut.json.
//
// Every surface is validated before anything is written: a missing badge,
// pill, eyebrow or changelog heading aborts the whole bump with all files
// untouched. Writes go through a same-directory temp file plus rename, so a
// crash cannot leave a half-updated surface.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSemver(value) {
  const m = SEMVER_RE.exec(String(value ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readText(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    throw new Error(`${rel} is missing or unreadable`);
  }
}

function atomicWrite(file, content) {
  const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

/**
 * Replaces the first regex hit with `replacement`, failing when the token is
 * absent so a restructured surface is never silently skipped.
 */
function swap(text, rel, re, replacement) {
  assert(re.test(text), `${rel} is missing ${re.source}`);
  return text.replace(re, replacement);
}

export function applyVersionBump(root, options) {
  assert(options && typeof options === 'object', 'options are required');

  const version = options.version;
  assert(parseSemver(version), `target version ${JSON.stringify(version)} is not a semver triple`);
  const payloadVersion = options.payloadVersion;
  assert(
    parseSemver(payloadVersion),
    `payload version ${JSON.stringify(payloadVersion)} is not a semver triple`,
  );
  const { artifactHash } = options;
  assert(
    typeof artifactHash === 'string' && SHA256_RE.test(artifactHash),
    `artifactHash ${JSON.stringify(artifactHash)} is not sha256:<64 hex>`,
  );
  assert(typeof options.receiptFile === 'string' && options.receiptFile.length > 0, 'receiptFile is required');
  assert(Number.isFinite(Date.parse(options.receiptAt)), `receiptAt ${JSON.stringify(options.receiptAt)} is not a date`);
  assert(typeof options.notes === 'string' && options.notes.length > 0, 'notes are required');
  assert(DATE_RE.test(options.date), `date ${JSON.stringify(options.date)} is not YYYY-MM-DD`);

  // ---- plan every surface before touching the disk ----
  let pkg;
  try {
    pkg = JSON.parse(readText(root, 'package.json'));
  } catch (error) {
    throw new Error(`package.json is not valid JSON: ${error.message}`);
  }
  assert(pkg && typeof pkg === 'object' && !Array.isArray(pkg), 'package.json must be an object');
  assert(
    parseSemver(pkg.version),
    `package.json version ${JSON.stringify(pkg.version)} is not a semver triple`,
  );
  const next = parseSemver(version);
  assert(
    compareSemver(next, parseSemver(pkg.version)) > 0,
    `target version ${version} is not greater than package.json ${pkg.version}`,
  );

  const pkgOut = { ...pkg, version };
  const packageText = `${JSON.stringify(pkgOut, null, 2)}\n`;

  const readmeText = readText(root, 'README.md');
  const readmeOut = swap(
    readmeText,
    'README.md',
    /version-\d+\.\d+\.\d+-blue/g,
    `version-${version}-blue`,
  );

  const changelogText = readText(root, 'CHANGELOG.md');
  const heading = /^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/m.exec(changelogText);
  assert(heading, 'CHANGELOG.md is missing a "## [x.y.z] - YYYY-MM-DD" heading');
  const before = changelogText.slice(0, heading.index).replace(/\s*$/, '\n\n');
  const changelogOut =
    `${before}## [${version}] - ${options.date}\n\n${options.notes}\n\n` +
    changelogText.slice(heading.index);

  const htmlText = readText(root, 'index.html');
  let htmlOut = swap(
    htmlText,
    'index.html',
    /class="ver-pill">v\d+\.\d+\.\d+</g,
    `class="ver-pill">v${version}<`,
  );
  htmlOut = swap(
    htmlOut,
    'index.html',
    /v\d+\.\d+\.\d+( · verified against Freebuff )\d+\.\d+\.\d+/,
    `v${version}$1${payloadVersion}`,
  );
  // The receipt panel repeats the claim twice (data-l attribute and text);
  // keep it in step with the eyebrow so the page never ships two payloads.
  htmlOut = swap(
    htmlOut,
    'index.html',
    /(✓ verified against Freebuff )\d+\.\d+\.\d+/g,
    `$1${payloadVersion}`,
  );
  // The page's embedded metadata carries the payload version too; refresh it
  // when present rather than letting the page disagree with its own pill.
  if (/freebuffVersion:'\d+\.\d+\.\d+'/.test(htmlOut)) {
    htmlOut = htmlOut.replace(
      /freebuffVersion:'\d+\.\d+\.\d+'/g,
      `freebuffVersion:'${payloadVersion}'`,
    );
  }
  if (/extensionVersion:'\d+\.\d+\.\d+'/.test(htmlOut)) {
    htmlOut = htmlOut.replace(
      /extensionVersion:'\d+\.\d+\.\d+'/g,
      `extensionVersion:'${version}'`,
    );
  }
  if (/hash:'sha256:[0-9a-f]{64}'/.test(htmlOut)) {
    htmlOut = htmlOut.replace(
      /hash:'sha256:[0-9a-f]{64}'/g,
      `hash:'${artifactHash}'`,
    );
  }

  const marker = {
    version,
    payloadVersion,
    artifactHash,
    receipt: options.receiptFile,
    at: options.receiptAt,
  };

  // ---- all surfaces validated: commit them ----
  const markerDir = path.join(root, 'release');
  fs.mkdirSync(markerDir, { recursive: true });
  atomicWrite(path.join(root, 'package.json'), packageText);
  atomicWrite(path.join(root, 'README.md'), readmeOut);
  atomicWrite(path.join(root, 'CHANGELOG.md'), changelogOut);
  atomicWrite(path.join(root, 'index.html'), htmlOut);
  atomicWrite(path.join(markerDir, 'last-cut.json'), `${JSON.stringify(marker, null, 2)}\n`);

  return {
    files: ['CHANGELOG.md', 'README.md', 'index.html', 'package.json', 'release/last-cut.json'],
  };
}

function arg(name, fallback = '') {
  const flag = `--${name}`;
  const hit = process.argv.findIndex((value) => value === flag || value.startsWith(`${flag}=`));
  if (hit === -1) return fallback;
  const inline = process.argv[hit].slice(name.length + 3);
  return inline || process.argv[hit + 1] || fallback;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  const root = arg('root', process.cwd());
  try {
    const result = applyVersionBump(root, {
      version: arg('version'),
      payloadVersion: arg('payload-version'),
      artifactHash: arg('artifact-hash'),
      receiptFile: arg('receipt-file'),
      receiptAt: arg('receipt-at'),
      notes: arg('notes'),
      date: arg('date', new Date().toISOString().slice(0, 10)),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`bump failed: ${error.message}\n`);
    process.exit(1);
  }
}
