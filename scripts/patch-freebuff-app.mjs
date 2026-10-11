#!/usr/bin/env node
// Patches a Freebuff Desktop install so the Freebuff Ads Remover loads in the
// Electron main process.
//
// Electron provides no supported preload path for packaged apps: `--require`,
// NODE_OPTIONS and `--app` are all ignored. The only injection point is the
// app payload itself, so this script:
//   1. extracts resources/app.asar into resources/app/
//   2. prepends an idempotent loader block to resources/app/electron/main.cjs
//   3. renames app.asar to app.asar.orig (Electron prefers app.asar when both
//      exist; with it gone, resources/app/ is the application directory)
//
// Usage: node patch-freebuff-app.mjs <resources-dir>
// Env:   FREEBUFF_ADS_REMOVER_ENTRY — absolute path of the extension entry
//        (defaults to ../dist/index.js relative to this script)

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = '// freebuff-ads-remover:begin (auto-injected by patch-freebuff-app.mjs; do not edit)';

function fail(message) {
  console.error(`[patch-freebuff-app] ${message}`);
  process.exit(1);
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const resourcesDir = process.argv[2];
if (!resourcesDir) {
  fail('usage: patch-freebuff-app.mjs <resources-dir>');
}

const entry = process.env.FREEBUFF_ADS_REMOVER_ENTRY || join(scriptDir, '..', 'dist', 'index.js');
const asarPath = join(resourcesDir, 'app.asar');
const backupPath = join(resourcesDir, 'app.asar.orig');
const appDir = join(resourcesDir, 'app');
const mainPath = join(appDir, 'electron', 'main.cjs');
const stagingDir = join(resourcesDir, 'app.far-staging');
const stagedMainPath = join(stagingDir, 'electron', 'main.cjs');

function loaderBlock() {
  return `${MARKER}
try {
  require(${JSON.stringify(entry)});
} catch (err) {
  console.error('[freebuff-ads-remover] failed to load:', err && err.message ? err.message : err);
}
// freebuff-ads-remover:end
`;
}

async function main() {
  if (!existsSync(resourcesDir)) {
    fail(`resources dir not found: ${resourcesDir}`);
  }

  if (existsSync(mainPath) && readFileSync(mainPath, 'utf8').includes(MARKER)) {
    if (existsSync(asarPath)) {
      rmSync(backupPath, { force: true });
      renameSync(asarPath, backupPath);
      console.log('[patch-freebuff-app] moved aside leftover app.asar (Electron would prefer it)');
    }
    console.log('[patch-freebuff-app] already patched');
    return;
  }

  if (!existsSync(asarPath) && existsSync(stagedMainPath)) {
    // Interrupted patch: staging was written but the final rename never ran.
    rmSync(appDir, { recursive: true, force: true });
    renameSync(stagingDir, appDir);
    console.log('[patch-freebuff-app] recovered interrupted patch');
    return;
  }

  if (!existsSync(asarPath)) {
    fail(`neither app.asar nor a patched app/ directory found in ${resourcesDir}`);
  }

  const { extractAll } = await import('@electron/asar');
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });
  extractAll(asarPath, stagingDir);

  if (!existsSync(stagedMainPath)) {
    fail('unexpected app layout: electron/main.cjs missing from app.asar');
  }
  writeFileSync(stagedMainPath, loaderBlock() + readFileSync(stagedMainPath, 'utf8'), 'utf8');

  rmSync(appDir, { recursive: true, force: true });
  rmSync(backupPath, { force: true });
  renameSync(asarPath, backupPath);
  renameSync(stagingDir, appDir);

  console.log(`[patch-freebuff-app] patched ${appDir}`);
  console.log(`[patch-freebuff-app] loader entry: ${entry}`);
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
