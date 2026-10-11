#!/usr/bin/env node
// Prints "<name> <version>" for a Freebuff payload resources dir, reading
// package.json from an unpacked app/ dir or from app.asar. Prints nothing
// (exit 0) when the directory is not a recognizable payload. Used by
// launch-freebuff.sh to spot updater-supplied payloads newer than the
// AppImage on disk.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function readPackageJson(dir, file) {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (pkg && typeof pkg.version === 'string') {
      return `${pkg.name ?? ''} ${pkg.version}`;
    }
  } catch {
    // not a readable payload — fall through
  }
  return null;
}

function main() {
  const resourcesDir = process.argv[2];
  if (!resourcesDir) {
    console.error('usage: payload-version.mjs <resources-dir>');
    process.exit(2);
  }

  const unpacked = existsSync(join(resourcesDir, 'app', 'package.json'))
    ? readPackageJson(resourcesDir, join('app', 'package.json'))
    : null;
  if (unpacked) {
    console.log(unpacked);
    return;
  }

  if (existsSync(join(resourcesDir, 'app.asar'))) {
    try {
      const asar = require('@electron/asar');
      const pkg = JSON.parse(asar.extractFile(join(resourcesDir, 'app.asar'), 'package.json').toString());
      if (pkg && typeof pkg.version === 'string') {
        console.log(`${pkg.name ?? ''} ${pkg.version}`);
        return;
      }
    } catch {
      // unreadable asar — fall through
    }
  }
}

main();
