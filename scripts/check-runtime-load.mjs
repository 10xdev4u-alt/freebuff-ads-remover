#!/usr/bin/env node
// Confirms the extension actually reached its success path during a boot.
//
// scripts/check-injection.mjs only proves the loader marker is present in
// app.asar before launch. This reads the load receipt bootstrap writes into the
// config directory at src/bootstrap.ts and fails when it is missing, stale,
// corrupt, from another version, or belongs to a dead PID.
//
// Usage: node scripts/check-runtime-load.mjs [--dir=<config-dir>] [--max-age-ms=300000]
// Exit:  0 = a fresh receipt from a live process, 1 = no trustworthy receipt

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

function fail(message) {
  console.error(`LOAD NOT CONFIRMED: ${message}`);
  process.exit(1);
}

function resolveConfigDir() {
  const base = arg('dir', process.env.FREEBUFF_CONFIG_DIR || '');
  const profile = process.env.FREEBUFF_PROFILE || '';
  return profile ? join(base, 'profiles', profile) : base;
}

function expectedVersion() {
  const override = arg('version', '');
  if (override) return override;
  try {
    const pkg = JSON.parse(readFileSync(join(scriptDir, '..', 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but is owned by another user.
    return error?.code === 'EPERM';
  }
}

const dir = resolveConfigDir();
if (!dir) fail('no config directory (pass --dir= or set FREEBUFF_CONFIG_DIR)');

const receiptPath = join(dir, 'load-receipt.json');
if (!existsSync(receiptPath)) fail(`no load receipt at ${receiptPath}`);

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
} catch (error) {
  fail(`load receipt is not valid JSON: ${error.message}`);
}

if (receipt?.status !== 'loaded') fail(`load receipt status is ${JSON.stringify(receipt?.status)}`);

const pid = Number(receipt?.pid);
if (!Number.isInteger(pid) || pid <= 0) fail(`load receipt has no usable pid: ${JSON.stringify(receipt?.pid)}`);
if (!pidIsAlive(pid)) fail(`load receipt pid ${pid} is not running`);

const version = expectedVersion();
if (version && receipt?.version !== version) {
  fail(`load receipt version ${JSON.stringify(receipt?.version)} != ${version}`);
}

const at = Date.parse(receipt?.at);
if (Number.isNaN(at)) fail(`load receipt has no usable timestamp: ${JSON.stringify(receipt?.at)}`);
const maxAge = Number(arg('max-age-ms', '300000'));
const age = Date.now() - at;
if (age > maxAge) fail(`load receipt is ${age}ms old (max ${maxAge}ms)`);

console.log(`LOAD CONFIRMED pid=${pid} version=${receipt.version} age=${age}ms`);
