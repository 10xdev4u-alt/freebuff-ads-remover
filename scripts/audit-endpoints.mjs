#!/usr/bin/env node
// Audits endpoint coverage against a Freebuff payload.
//
// Freebuff ships near-daily, and each release can add ad routes. The interceptor
// only blocks what AD_ENDPOINTS lists, so a new route silently leaks ads. This
// script scrapes every route out of the orchestrator + renderer bundle, keeps the
// ad-related ones, and reports any the interceptor misses.
//
// Usage: node scripts/audit-endpoints.mjs <resources-dir>
//        node scripts/audit-endpoints.mjs /tmp/freebuff-ads-remover-extract/squashfs-root/resources
// Exit:  0 = every ad route blocked, 1 = gaps (or nothing scanned)

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AdInterceptor } = require('../dist/interceptor.js');
const { DEFAULT_CONFIG } = require('../dist/types.js');

const resources = process.argv[2];
if (!resources || !existsSync(resources)) {
  console.error('usage: audit-endpoints.mjs <resources-dir>');
  process.exit(1);
}

const sources = [];
const orch = join(resources, 'orchestrator', 'orchestrator.js');
if (existsSync(orch)) sources.push(readFileSync(orch, 'utf8'));

const uiDir = join(resources, 'orchestrator', 'ui', 'assets');
if (existsSync(uiDir)) {
  for (const file of readdirSync(uiDir)) {
    if (file.endsWith('.js') && file.startsWith('index-')) {
      sources.push(readFileSync(join(uiDir, file), 'utf8'));
    }
  }
}
if (sources.length === 0) {
  console.error(`no orchestrator/ui sources found under ${resources}`);
  process.exit(1);
}

// Route patterns may be literals or contain :params / ${} template holes.
const routes = new Set();
for (const src of sources) {
  for (const m of src.matchAll(/["'`](\/api\/[a-zA-Z0-9/_:${}.-]*)/g)) {
    routes.add(m[1].replace(/\$\{[^}]*\}/g, ':param'));
  }
}
const AD_ROUTE = /(^|\/)ad(s)?\//i;
const AD_EXTRA = /ad-density|display-ad|sponsored-survey|creative-image/i;
// Not ads, just words that contain "ad".
const NOT_AD = /admission|adapter|address|admin/i;
// Router mount prefix, not a handler.
const IGNORE = new Set(['/api/ad/']);
const adRoutes = [...routes]
  .filter((r) => (AD_ROUTE.test(r) || AD_EXTRA.test(r)) && !NOT_AD.test(r) && !IGNORE.has(r))
  .sort();

const interceptor = new AdInterceptor(DEFAULT_CONFIG, {
  debug() {}, info() {}, warn() {}, error() {},
});
const results = adRoutes.map((route) => ({
  route,
  blocked: interceptor.intercept(`http://127.0.0.1:5174${route}`, 'POST').blocked,
}));

const missing = results.filter((r) => !r.blocked);
for (const r of results) {
  console.log(`${r.blocked ? 'blocked' : 'MISSED '}  ${r.route}`);
}
console.log(`\n${results.length - missing.length}/${results.length} ad routes blocked`);
if (missing.length > 0) {
  console.error(`\nGaps — add these to AD_ENDPOINTS in src/types.ts:`);
  for (const r of missing) console.error(`  ${r.route}`);
  process.exit(1);
}
