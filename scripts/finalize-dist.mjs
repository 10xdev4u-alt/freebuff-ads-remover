// Post-processes the tsc output: the repo is ESM (`"type": "module"`) but
// tsc emits CommonJS, so dist/ needs its own package.json marker or Node
// refuses to `require()` the built extension.

import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(join(root, 'dist', 'package.json'), '{"type":"commonjs"}\n', 'utf8');

const stale = join(root, 'dist', 'index.cjs');
if (existsSync(stale)) {
  rmSync(stale);
}

console.log('[build] dist/package.json -> {"type":"commonjs"}');
