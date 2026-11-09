#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
function get(flag) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; }
const input = get('--input');
const out = get('--out') || 'inbound/candidates.json';
const minInstalls = Number(get('--min-installs') || 3);

let raw = '';
if (input) raw = fs.readFileSync(input, 'utf8');
else raw = fs.readFileSync(0, 'utf8');
let data;
try { data = JSON.parse(raw); } catch { console.error('bad json'); process.exit(2); }
const envelopes = Array.isArray(data) ? data : (data.envelopes ?? []);

const CONTROL = new Set(['/healthz', '/api/account/usage', '/api/user/me', '/api/auth/session', '/api/config']);

let classifyRoute;
try { classifyRoute = require('../dist/candidates.js').classifyRoute; } catch (e) { 
  classifyRoute = (r) => ({ candidate: false, confidence: 0, signals: [] });
}

const groups = new Map();
for (const e of envelopes) {
  if (!e || typeof e.route !== 'string') continue;
  const key = `${e.route}|${e.host ?? ''}|${e.method ?? 'POST'}`;
  if (!groups.has(key)) groups.set(key, { route: e.route, host: e.host, method: e.method, installs: new Set(), envelopes: [] });
  const g = groups.get(key);
  g.installs.add(e.installIdHash ?? 'unknown');
  g.envelopes.push(e);
}

const candidates = [];
for (const g of groups.values()) {
  if (CONTROL.has(g.route)) continue;
  if (g.installs.size < minInstalls) continue;
  const c = classifyRoute(g.route, { host: g.host });
    if (!c.candidate || c.confidence < 0.35) continue;
  candidates.push({
    route: g.route,
    host: g.host,
    method: g.method,
    installs: g.installs.size,
    confidence: c.confidence,
    signals: c.signals,
  });
}

const result = { generatedAt: new Date().toISOString(), candidates };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ candidates: candidates.length }));
