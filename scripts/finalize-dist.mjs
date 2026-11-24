// Post-processes the tsc output: the repo is ESM (`"type": "module"`) but
// tsc emits CommonJS, so dist/ needs its own package.json marker or Node
// refuses to `require()` the built extension.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizePageClient, smokeTestPageClient } from './page-client-guard.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(join(root, 'dist', 'package.json'), '{"type":"commonjs"}\n', 'utf8');

const stale = join(root, 'dist', 'index.cjs');
if (existsSync(stale)) {
  rmSync(stale);
}

console.log('[build] dist/package.json -> {"type":"commonjs"}');

// dist/dashboard-client.js is evaluated verbatim inside the Freebuff page via
// executeJavaScript, so it must be a classic script with no module system
// syntax. The guard parses the emitted file, strips only the tolerated tsc
// marker, and rejects anything else that would throw in a page.
const clientPath = join(root, 'dist', 'dashboard-client.js');
if (!existsSync(clientPath)) {
  console.error('[build] dist/dashboard-client.js is missing: tsc did not emit the page client');
  process.exit(1);
}

const original = readFileSync(clientPath, 'utf8');
const { code: sanitized, findings, markersRemoved } = sanitizePageClient(original);
for (const finding of findings) {
  console.error(`[build] dashboard-client.js: ${finding}`);
}
if (findings.length > 0) process.exit(1);

const smoke = smokeTestPageClient(sanitized);
if (!smoke.ok) {
  console.error(`[build] dashboard-client.js failed its page-context smoke test: ${smoke.error ?? 'unknown error'}`);
  process.exit(1);
}

if (sanitized !== original) {
  writeFileSync(clientPath, sanitized, 'utf8');
  console.log(`[build] dashboard-client.js sanitized for page injection (${markersRemoved} CommonJS marker(s) removed)`);
} else {
  console.log('[build] dashboard-client.js already page-safe');
}
