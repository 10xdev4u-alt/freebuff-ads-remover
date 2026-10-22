#!/usr/bin/env node
// Patches a Freebuff Desktop install so the Freebuff Ads Remover loads in the
// Electron main process.
//
// Electron provides no supported preload path for packaged apps: `--require`,
// NODE_OPTIONS and `--app` are all ignored. The only injection point is the
// app payload itself, so this script:
//   1. extracts resources/app.asar into a staging dir
//   2. prepends an idempotent loader block to electron/main.cjs
//   3. repacks the staging dir back into resources/app.asar
//   4. keeps the untouched archive as app.asar.orig
//
// It must repack the archive, not leave an unpacked resources/app/ directory:
// Freebuff >= 0.0.186 ships with the Electron `OnlyLoadAppFromAsar` fuse
// enabled, so an app/ directory makes Electron bail out before main.cjs runs
// (silent exit 1, no window, no log line).
//
// Usage: node patch-freebuff-app.mjs <resources-dir>
// Env:   FREEBUFF_ADS_REMOVER_ENTRY — absolute path of the extension entry
//        (defaults to ../dist/index.js relative to this script)

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKER = '// freebuff-ads-remover:begin (auto-injected by patch-freebuff-app.mjs; do not edit)';
const LOADER_RE = /\/\/ freebuff-ads-remover:begin[\s\S]*?\/\/ freebuff-ads-remover:end\n/;

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
const stagingDir = join(resourcesDir, 'app.asar-staging');
const pendingAsar = join(resourcesDir, 'app.asar.patching');
const unpackedDir = join(resourcesDir, 'app.asar.unpacked');
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

/** Returns the archive's electron/main.cjs, or null when the asar is unusable. */
async function readMain(asarFile) {
  const { extractFile } = await import('@electron/asar');
  try {
    return extractFile(asarFile, 'electron/main.cjs').toString('utf8');
  } catch {
    return null;
  }
}

function dropLegacyAppDir() {
  if (existsSync(appDir)) {
    rmSync(appDir, { recursive: true, force: true });
    console.log('[patch-freebuff-app] removed legacy unpacked resources/app/ (OnlyLoadAppFromAsar)');
  }
}

async function main() {
  if (!existsSync(resourcesDir)) {
    fail(`resources dir not found: ${resourcesDir}`);
  }

  // Migration: earlier versions patched by unpacking app.asar into resources/app/.
  // Freebuff >= 0.0.186 refuses to boot that layout, so put the archive back and
  // let the repack path below patch it properly.
  if (!existsSync(asarPath) && existsSync(backupPath)) {
    renameSync(backupPath, asarPath);
    console.log('[patch-freebuff-app] restored app.asar from app.asar.orig (legacy patch migration)');
  }

  if (!existsSync(asarPath)) {
    if (existsSync(stagedMainPath)) {
      rmSync(stagingDir, { recursive: true, force: true });
    }
    fail(`no app.asar found in ${resourcesDir} — cannot install the ads remover into this build`);
  }

  if (existsSync(unpackedDir)) {
    fail('app.asar.unpacked is present; repacking would drop unpacked native modules. Refusing to patch.');
  }

  const current = await readMain(asarPath);
  const patched = typeof current === 'string' && current.includes(MARKER);

  if (patched) {
    dropLegacyAppDir();
    if (current.includes(`require(${JSON.stringify(entry)});`)) {
      console.log('[patch-freebuff-app] already patched');
      return;
    }
  }

  const { extractAll, createPackageWithOptions } = await import('@electron/asar');

  rmSync(stagingDir, { recursive: true, force: true });
  rmSync(pendingAsar, { force: true });
  mkdirSync(stagingDir, { recursive: true });
  extractAll(asarPath, stagingDir);

  if (!existsSync(stagedMainPath)) {
    rmSync(stagingDir, { recursive: true, force: true });
    fail('unexpected app layout: electron/main.cjs missing from app.asar');
  }

  // Re-baking an already patched archive (extension moved): swap the loader.
  const body = readFileSync(stagedMainPath, 'utf8').replace(LOADER_RE, '');
  writeFileSync(stagedMainPath, loaderBlock() + body, 'utf8');

  await createPackageWithOptions(stagingDir, pendingAsar, {});

  const packedMain = await readMain(pendingAsar);
  if (!packedMain || !packedMain.includes(MARKER)) {
    rmSync(pendingAsar, { force: true });
    rmSync(stagingDir, { recursive: true, force: true });
    fail('repacked archive failed verification (loader marker missing)');
  }

  if (!patched) {
    rmSync(backupPath, { force: true });
    copyFileSync(asarPath, backupPath);
  }

  renameSync(pendingAsar, asarPath);
  rmSync(stagingDir, { recursive: true, force: true });
  dropLegacyAppDir();

  console.log(`[patch-freebuff-app] patched ${asarPath} (${statSync(asarPath).size} bytes)`);
  console.log(`[patch-freebuff-app] loader entry: ${entry}`);
  if (existsSync(backupPath)) {
    console.log(`[patch-freebuff-app] pristine archive kept at ${backupPath}`);
  }
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
