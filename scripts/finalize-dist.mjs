// Post-processes the tsc output: the repo is ESM (`"type": "module"`) but
// tsc emits CommonJS, so dist/ needs its own package.json marker or Node
// refuses to `require()` the built extension.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(join(root, 'dist', 'package.json'), '{"type":"commonjs"}\n', 'utf8');

const stale = join(root, 'dist', 'index.cjs');
if (existsSync(stale)) {
  rmSync(stale);
}

console.log('[build] dist/package.json -> {"type":"commonjs"}');

// dist/dashboard-client.js is evaluated verbatim inside the Freebuff page
// via executeJavaScript. tsc's CommonJS wrapper (`exports.__esModule`) would
// throw ReferenceError there — `exports` does not exist in a page — so strip
// it and fail the build if any other CommonJS/ESM syntax survives.
const clientPath = join(root, 'dist', 'dashboard-client.js');
if (existsSync(clientPath)) {
  const original = readFileSync(clientPath, 'utf8');
  const sanitized = original
    .split('\n')
    .filter((line) => !/^Object\.defineProperty\(exports,/.test(line.trim()))
    .join('\n');

  const leftovers = sanitized.match(
    /\brequire\s*\(|\bmodule\.exports\b|^Object\.defineProperty\(exports/m,
  );
  if (leftovers) {
    console.error(
      `[build] dashboard-client.js still contains page-unsafe syntax: ${leftovers.join(', ')}`,
    );
    process.exit(1);
  }

  if (sanitized !== original) {
    writeFileSync(clientPath, sanitized, 'utf8');
    console.log('[build] dashboard-client.js sanitized for page injection');
  }
}
