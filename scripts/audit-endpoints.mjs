#!/usr/bin/env node
// Audits endpoint and DOM-surface coverage against a Freebuff payload.
//
// Freebuff ships near-daily, and each release can add ad routes and ad CSS
// classes. The interceptor only blocks what AD_ENDPOINTS lists, and the CSS
// fallback only hides what AD_CSS_SELECTORS lists, so a new route or selector
// silently leaks ads. This script scrapes every ad route and every ad selector
// the app uses, and reports any the extension misses.
//
// Usage: node scripts/audit-endpoints.mjs <resources-dir>
//        node scripts/audit-endpoints.mjs /tmp/freebuff-ads-remover-extract/squashfs-root/resources
// Exit:  0 = every ad route and app-used ad selector covered, 1 = gaps

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { AdInterceptor } = require('../dist/interceptor.js');
const { DEFAULT_CONFIG, AD_CSS_SELECTORS } = require('../dist/types.js');

const jsonMode = process.argv.includes('--json');
const configDirArg = process.argv.find((a) => a.startsWith('--config-dir='));
const genRulesArg = process.argv.find((a) => a.startsWith('--generated-rules='));
const genRulesPath = genRulesArg ? genRulesArg.split('=').slice(1).join('=') : null;
const configDir = configDirArg ? configDirArg.split('=')[1] : null;
const resources = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]);
if (!resources || !existsSync(resources)) {
  if(!jsonMode) console.error('usage: audit-endpoints.mjs <resources-dir>');
  process.exit(1);
}

const sources = [];
// Deep scan: every JS/CSS bundle under resources, plus electron modules in app.asar.
function collectFiles(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full);
    else if (/\.(js|cjs|mjs|css)$/.test(entry.name)) sources.push(readFileSync(full, 'utf8'));
  }
}
collectFiles(join(resources, 'orchestrator'));
// Also extract electron modules from app.asar if present (best-effort).
const asarPath = join(resources, 'app.asar');
if (existsSync(asarPath)) {
  try {
    const asar = require('@electron/asar');
    const list = asar.listPackage(asarPath);
    for (const f of list) {
      if (/\.(js|cjs|mjs|css)$/.test(f) && /electron\//.test(f)) {
        try { sources.push(asar.extractFile(asarPath, f).toString('utf8')); } catch { /* skip */ }
      }
    }
  } catch { /* asar unavailable; continue */ }
}
if (sources.length === 0) {
  if(!jsonMode) console.error(`no sources found under ${resources}`);
  process.exit(1);
}

// ---- Endpoint audit ----
const routes = new Set();
for (const src of sources) {
  for (const m of src.matchAll(/["'`](\/api\/[a-zA-Z0-9/_:${}.-]*)/g)) {
    routes.add(m[1].replace(/\$\{[^}]*\}/g, ':param'));
  }
}
let isAdRoute;
try {
  isAdRoute = require('../dist/ad-heuristics.js').isAdRoute;
} catch {
  // Fallback (keep in sync with src/ad-heuristics.ts) when dist is not built.
  const AD_ROUTE = /(^|\/)ad(s)?\//i;
  const AD_EXTRA = /ad-density|display-ad|sponsored-survey|creative-image/i;
  const NOT_AD = /admission|adapter|address|admin/i;
  const IGNORE = new Set(['/api/ad/']);
  isAdRoute = (r) => !IGNORE.has(r) && !NOT_AD.test(r) && (AD_ROUTE.test(r) || AD_EXTRA.test(r));
}
const adRoutes = [...routes].filter((r) => isAdRoute(r)).sort();

let registry = null;
if (configDir) {
  try {
    const { RuleRegistry } = require('../dist/rule-registry.js');
    registry = RuleRegistry.load(configDir) ?? new RuleRegistry();
    if (genRulesPath) {
      const { loadGeneratedRules } = require('../dist/generated-rules.js');
      const g = loadGeneratedRules(genRulesPath);
      if (g) registry.apply(g);
    }
  } catch { registry = null; }
}
const interceptor = new AdInterceptor(DEFAULT_CONFIG, {
  debug() {}, info() {}, warn() {}, error() {},
}, undefined, undefined, registry || undefined);
const results = adRoutes.map((route) => ({
  route,
  blocked: interceptor.intercept(`http://127.0.0.1:5174${route}`, 'POST').blocked,
}));

const missing = results.filter((r) => !r.blocked);
for (const r of results) {
  if(!jsonMode) console.log(`${r.blocked ? 'blocked' : 'MISSED '}  ${r.route}`);
}
if(!jsonMode) console.log(`\n${results.length - missing.length}/${results.length} ad routes blocked`);

// ---- DOM surface audit ----
const AD_TOKEN = /^(?:ad|ads|sponsor|sponsored|billboard|intermission|spotlight|showcase|partner|invitation)(?:[-_].*)?$|^.*[-_](?:ad|ads|sponsor|sponsored|billboard|intermission|spotlight|showcase|partner|invitation)(?:[-_].*)?$/i;
const SELECTORISH = /^[\s.#\[\]="\'a-zA-Z0-9_>+~:,*()^-]+$/;

function extractSelectorLiterals(source) {
  const out = new Set();
  for (const m of source.matchAll(/(["'`])((?:(?!\1).){0,300})\1/g)) {
    const s = m[2];
    if (!s || s.includes('://') || s.length > 300) continue;
    if (!s.includes('-')) continue;
    if (!SELECTORISH.test(s)) continue;
    const toks = [...s.matchAll(/\.[A-Za-z_][\w-]*/g)].map((x) => x[0].slice(1));
    const adtoks = toks.filter((t) => AD_TOKEN.test(t));
    if (adtoks.length === 0) continue;
    out.add(s);
  }
  return out;
}

const selectorLiterals = new Set();
for (const src of sources) {
  for (const sel of extractSelectorLiterals(src)) selectorLiterals.add(sel);
}

// Coverage helpers: a class token is covered if any AD_CSS_SELECTORS entry
// contains it as a substring (attribute selector) or equals it.
function coveredClass(cls) {
  const lower = cls.toLowerCase();
  for (const surfaceSelectors of Object.values(AD_CSS_SELECTORS)) {
    for (const sel of surfaceSelectors) {
      const attr = sel.match(/\[class\*="([^"]+)"\]/i);
      if (attr) {
        const token = attr[1].toLowerCase();
        if (lower.includes(token) || token.includes(lower)) return true;
      }
      for (const m of sel.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
        const token = m[1].toLowerCase();
        if (lower === token || lower.includes(token) || token.includes(lower)) return true;
      }
    }
  }
  return false;
}

const domGaps = [];
if(!jsonMode) console.log('\n--- DOM surfaces (selector literals the app uses) ---');
for (const sel of [...selectorLiterals].sort()) {
  const compounds = sel.split(',').map((s) => s.trim()).filter(Boolean);
  const uncovered = compounds.filter((compound) => {
    const classes = [...compound.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);
    return !classes.some((c) => coveredClass(c));
  });
  if (uncovered.length === 0) {
    if(!jsonMode) console.log(`covered   ${sel}`);
  } else {
    if(!jsonMode) console.log(`MISSED   ${sel}  (uncovered: ${uncovered.join(' ')})`);
    domGaps.push(sel);
  }
}
if (selectorLiterals.size === 0) {
  if(!jsonMode) console.log('(no ad selector literals found)');
}

// CSS-only review list (informational): ad classes present in the UI stylesheet
// that no AD_CSS_SELECTORS entry mentions. Many are children of a hidden root,
// but a new root here is a candidate for coverage.
const uiDir = join(resources, 'orchestrator', 'ui', 'assets');
const cssSources = [];
if (existsSync(uiDir)) {
  for (const file of readdirSync(uiDir)) {
    if (file.endsWith('.css')) cssSources.push(readFileSync(join(uiDir, file), 'utf8'));
  }
}
const cssAdClasses = new Set();
for (const src of cssSources) {
  for (const m of src.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
    const cls = m[1];
    if (AD_TOKEN.test(cls)) cssAdClasses.add(cls);
  }
}
const cssGaps = [...cssAdClasses].filter((cls) => !coveredClass(cls)).sort();
if(!jsonMode) console.log(`\n--- DOM surfaces (CSS-only ad classes, review) ---`);
if(!jsonMode) console.log(`${cssAdClasses.size - cssGaps.length}/${cssAdClasses.size} CSS ad classes covered`);
if (cssGaps.length > 0) {
  if(!jsonMode) console.log('Not directly matched (likely children of a hidden root, or new surfaces):');
  for (const cls of cssGaps) if(!jsonMode) console.log(`  .${cls}`);
}

if (missing.length > 0) {
  if(!jsonMode) console.error(`\nGaps — add these to AD_ENDPOINTS in src/types.ts:`);
  for (const r of missing) if(!jsonMode) console.error(`  ${r.route}`);
}
if (domGaps.length > 0) {
  if(!jsonMode) console.error(`\nDOM gaps — add selectors for these to AD_CSS_SELECTORS in src/types.ts:`);
  for (const r of domGaps) if(!jsonMode) console.error(`  ${r}`);
}
const summary = {
  routes: { total: results.length, blocked: results.length - missing.length, missing },
  dom: { total: selectorLiterals.size, covered: selectorLiterals.size - domGaps.length, gaps: domGaps },
  css: { total: cssAdClasses.size, covered: cssAdClasses.size - cssGaps.length, gaps: cssGaps },
  pass: missing.length === 0 && domGaps.length === 0,
};
if (jsonMode) {
  process.stdout.write(JSON.stringify(summary) + '\n');
} else {
  if(!jsonMode) console.log(`\n${results.length - missing.length}/${results.length} ad routes blocked; ${selectorLiterals.size - domGaps.length}/${selectorLiterals.size} app ad selectors covered`);
}
if (missing.length > 0 || domGaps.length > 0) process.exit(1);
