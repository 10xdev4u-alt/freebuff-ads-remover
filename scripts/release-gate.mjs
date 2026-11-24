#!/usr/bin/env node
// Decides whether a release should be cut from the newest verified live receipt.
//
// A cut requires a fresh, passing live-e2e receipt whose (payloadVersion,
// artifactHash) pair differs from release/last-cut.json. The bump is MINOR when
// the payload version changed and PATCH otherwise; a newer timestamp alone never
// mints a version. Every malformed, stale, ambiguous or regressed input fails
// closed as 'invalid', which the CLI turns into a non-zero exit.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MAX_RECEIPT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

export function parseSemver(value) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function bumpSemver(version, bump) {
  const parts = parseSemver(version);
  if (!parts) return null;
  return bump === 'minor'
    ? `${parts[0]}.${parts[1] + 1}.0`
    : `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function readJson(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    return { ok: false };
  }
}

function sha256(buffer) {
  return 'sha256:' + crypto.createHash('sha256').update(buffer).digest('hex');
}

function invalid(error) {
  return { status: 'invalid', error };
}

/**
 * Selects the newest live-e2e receipt and re-verifies every field the ledger
 * relies on, plus the two hashes that tie it to the shipped artifact and corpus.
 */
export function selectVerifiedLiveReceipt(root, now = Date.now()) {
  const dir = path.join(root, 'receipts');
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith('live-') && f.endsWith('.json'));
  } catch {
    files = [];
  }
  if (files.length === 0) return { ok: false, error: 'no live receipt present' };

  const parsed = [];
  for (const file of files) {
    const read = readJson(path.join(dir, file));
    if (!read.ok) return { ok: false, error: `live receipt unreadable: ${file}` };
    parsed.push({ file, receipt: read.value });
  }

  const timed = parsed.map((entry) => ({ ...entry, t: Date.parse(entry.receipt?.at) }));
  if (timed.some((entry) => !Number.isFinite(entry.t))) {
    return { ok: false, error: 'live receipt has a missing or invalid timestamp' };
  }
  const newest = Math.max(...timed.map((entry) => entry.t));
  const top = timed.filter((entry) => entry.t === newest);
  if (new Set(top.map((entry) => JSON.stringify(entry.receipt))).size > 1) {
    return { ok: false, error: 'ambiguous newest live receipts' };
  }

  const chosen = top[0];
  const age = now - newest;
  if (age > MAX_RECEIPT_AGE_MS) {
    return { ok: false, error: `live receipt is stale (${Math.round(age / 86400000)}d old)` };
  }
  if (age < -CLOCK_SKEW_MS) return { ok: false, error: 'live receipt timestamp is in the future' };

  const receipt = chosen.receipt;
  if (receipt.pass !== true) return { ok: false, error: 'live receipt did not pass' };
  if (receipt.provenance !== 'live-e2e') {
    return { ok: false, error: `live receipt provenance ${JSON.stringify(receipt.provenance)} != "live-e2e"` };
  }
  if (!Number.isFinite(receipt.probes) || receipt.probes <= 0) {
    return { ok: false, error: 'live receipt has no probes' };
  }
  if (!parseSemver(receipt.payloadVersion)) {
    return { ok: false, error: `live receipt payloadVersion ${JSON.stringify(receipt.payloadVersion)} is not a semver triple` };
  }

  let artifactBuffer;
  try {
    artifactBuffer = fs.readFileSync(path.join(root, 'config', 'generated-rules.json'));
  } catch {
    return { ok: false, error: 'config/generated-rules.json is missing' };
  }
  if (receipt.artifactHash !== sha256(artifactBuffer)) {
    return { ok: false, error: 'live receipt artifactHash does not match config/generated-rules.json' };
  }

  let corpusBuffer;
  try {
    corpusBuffer = fs.readFileSync(path.join(root, 'corpus', 'golden.jsonl'));
  } catch {
    return { ok: false, error: 'corpus/golden.jsonl is missing' };
  }
  if (receipt.corpusHash !== sha256(corpusBuffer)) {
    return { ok: false, error: 'live receipt corpusHash does not match corpus/golden.jsonl' };
  }

  return { ok: true, receipt, file: `receipts/${chosen.file}` };
}

/**
 * Compares the verified receipt with the recorded cut. Returns status 'cut'
 * (with the next version), 'none' (idempotent no-op) or 'invalid' (fail closed).
 */
export function evaluateReleaseCut(root, now = Date.now()) {
  const selected = selectVerifiedLiveReceipt(root, now);
  if (!selected.ok) return invalid(selected.error);

  const marker = readJson(path.join(root, 'release', 'last-cut.json'));
  if (!marker.ok) return invalid('release/last-cut.json is missing or corrupt');
  const recorded = marker.value;
  if (!parseSemver(recorded?.version)) {
    return invalid(`release/last-cut.json version ${JSON.stringify(recorded?.version)} is not semver`);
  }
  if (!parseSemver(recorded?.payloadVersion)) {
    return invalid(`release/last-cut.json payloadVersion ${JSON.stringify(recorded?.payloadVersion)} is not a semver triple`);
  }
  if (typeof recorded?.artifactHash !== 'string' || !SHA256_RE.test(recorded.artifactHash)) {
    return invalid('release/last-cut.json artifactHash is not sha256:<64 hex>');
  }

  const receiptPayload = parseSemver(selected.receipt.payloadVersion);
  const recordedPayload = parseSemver(recorded.payloadVersion);
  if (compareSemver(receiptPayload, recordedPayload) < 0) {
    return invalid(
      `receipt payloadVersion ${selected.receipt.payloadVersion} is older than the last cut ${recorded.payloadVersion}`,
    );
  }
  if (selected.receipt.payloadVersion === recorded.payloadVersion && selected.receipt.artifactHash === recorded.artifactHash) {
    return {
      status: 'none',
      reason: `(${selected.receipt.payloadVersion}, artifactHash) pair matches the last cut in ${recorded.version}`,
    };
  }

  const pkg = readJson(path.join(root, 'package.json'));
  if (!pkg.ok) return invalid('package.json is missing or corrupt');
  const current = parseSemver(pkg.value?.version);
  if (!current) return invalid(`package.json version ${JSON.stringify(pkg.value?.version)} is not semver`);

  const bump = selected.receipt.payloadVersion !== recorded.payloadVersion ? 'minor' : 'patch';
  const version = bumpSemver(pkg.value.version, bump);
  if (!version || compareSemver(parseSemver(version), current) <= 0) {
    return invalid(`computed version ${version} is not greater than package.json ${pkg.value.version}`);
  }

  return {
    status: 'cut',
    version,
    bump,
    payloadVersion: selected.receipt.payloadVersion,
    artifactHash: selected.receipt.artifactHash,
    receiptFile: selected.file,
    receiptAt: selected.receipt.at,
  };
}

/**
 * Asserts that the recorded cut is safe to tag: the marker agrees with
 * package.json, points at a committed live-e2e receipt, that receipt matches
 * the marker pair and is still fresh. Throws on any disagreement, so the tag
 * workflow fails closed instead of publishing an unverified version.
 */
export function assertTagReady(root, now = Date.now()) {
  const markerRead = readJson(path.join(root, 'release', 'last-cut.json'));
  if (!markerRead.ok) throw new Error('release/last-cut.json is missing or corrupt');
  const marker = markerRead.value;
  if (!parseSemver(marker?.version)) {
    throw new Error(`release marker version ${JSON.stringify(marker?.version)} is not semver`);
  }
  if (!parseSemver(marker?.payloadVersion)) {
    throw new Error(`release marker payloadVersion ${JSON.stringify(marker?.payloadVersion)} is not a semver triple`);
  }
  if (typeof marker?.artifactHash !== 'string' || !SHA256_RE.test(marker.artifactHash)) {
    throw new Error('release marker artifactHash is not sha256:<64 hex>');
  }
  if (typeof marker?.receipt !== 'string' || marker.receipt.length === 0) {
    throw new Error('release marker has no receipt path');
  }
  if (path.isAbsolute(marker.receipt) || marker.receipt.split(/[\\/]/).includes('..')) {
    throw new Error(`release marker receipt path ${marker.receipt} escapes the repo`);
  }

  const pkg = readJson(path.join(root, 'package.json'));
  if (!pkg.ok) throw new Error('package.json is missing or corrupt');
  if (pkg.value?.version !== marker.version) {
    throw new Error(`release marker version ${marker.version} != package.json ${pkg.value?.version}`);
  }

  let receipt;
  try {
    receipt = JSON.parse(fs.readFileSync(path.join(root, marker.receipt), 'utf8'));
  } catch {
    throw new Error(`release marker receipt ${marker.receipt} is missing or unreadable`);
  }
  if (receipt.payloadVersion !== marker.payloadVersion) {
    throw new Error(`marker receipt payloadVersion ${receipt.payloadVersion} != marker ${marker.payloadVersion}`);
  }
  if (receipt.artifactHash !== marker.artifactHash) {
    throw new Error(`marker receipt artifactHash ${receipt.artifactHash} != marker ${marker.artifactHash}`);
  }
  if (receipt.pass !== true) throw new Error('marker receipt did not pass');
  if (receipt.provenance !== 'live-e2e') throw new Error('marker receipt is not live-e2e provenance');
  if (!Number.isFinite(receipt.probes) || receipt.probes <= 0) throw new Error('marker receipt has no probes');
  const age = now - Date.parse(receipt.at);
  if (!Number.isFinite(age)) throw new Error('marker receipt has a missing or invalid timestamp');
  if (age > MAX_RECEIPT_AGE_MS) throw new Error(`marker receipt is stale (${Math.round(age / 86400000)}d old)`);

  return { version: marker.version };
}

const OUTPUT_KEYS = [
  ['status', 'status'],
  ['version', 'version'],
  ['bump', 'bump'],
  ['payloadVersion', 'payload-version'],
  ['artifactHash', 'artifact-hash'],
  ['receiptFile', 'receipt-file'],
  ['receiptAt', 'receipt-at'],
  ['reason', 'reason'],
  ['error', 'error'],
];

function emit(result, githubOutput) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!githubOutput) return;
  const lines = OUTPUT_KEYS
    .filter(([key]) => result[key] !== undefined && result[key] !== null)
    .map(([key, name]) => `${name}=${result[key]}`);
  fs.appendFileSync(githubOutput, `${lines.join('\n')}\n`);
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
  const githubOutput = process.env.GITHUB_OUTPUT || '';
  if (process.argv.includes('--tag')) {
    try {
      emit({ status: 'ok', ...assertTagReady(root) }, githubOutput);
      process.exit(0);
    } catch (error) {
      process.stderr.write(`tag check failed: ${error.message}\n`);
      process.exit(1);
    }
  }
  const result = evaluateReleaseCut(root);
  emit(result, githubOutput);
  process.exit(result.status === 'invalid' ? 1 : 0);
}
