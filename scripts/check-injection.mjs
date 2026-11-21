#!/usr/bin/env node
// Returns 0 if the given app.asar contains the ads-remover loader block.
// The begin marker alone is not proof: a truncated main.cjs can keep it.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const path = process.argv[2];
const entry = process.env.FREEBUFF_ADS_REMOVER_ENTRY || '';
if (!entry) {
  console.error('FREEBUFF_ADS_REMOVER_ENTRY is required');
  process.exit(1);
}
try {
  const main = asar.extractFile(path, 'electron/main.cjs').toString();
  const hasBegin = main.includes('freebuff-ads-remover:begin');
  const hasEnd = main.includes('freebuff-ads-remover:end');
  process.exit(hasBegin && hasEnd && main.includes(entry) ? 0 : 1);
} catch {
  process.exit(1);
}
