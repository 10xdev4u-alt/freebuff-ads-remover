#!/usr/bin/env node
// Returns 0 if the given app.asar contains the ads-remover loader marker.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const path = process.argv[2];
try {
  const main = asar.extractFile(path, 'electron/main.cjs').toString();
  process.exit(main.includes('freebuff-ads-remover:begin') ? 0 : 1);
} catch {
  process.exit(1);
}
