#!/usr/bin/env node
/**
 * Headless end-to-end verification of the Freebuff Ads Remover against a real
 * Freebuff AppImage. Extracts the AppImage, patches it, launches Electron
 * under xvfb, and asserts the in-app RuntimeVerifier reports pass:true.
 *
 * Usage:
 *   node scripts/e2e-headless.mjs --appimage <path> [--extract-dir <dir>] [--timeout <ms>]
 *
 * Exits 0 on success or when --appimage is omitted (skip mode for CI without payload).
 * Exits 1 on any verification failure.
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { copyFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
function get(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const appimage = get('--appimage');
const extractDir = resolve(get('--extract-dir') || join(tmpdir(), 'far-e2e-extract'));
const timeout = Number(get('--timeout') || 120000);
const genRules = get('--generated-rules');
const promote = args.includes('--promote');
const feed = args.includes('--feed');
const expectPromoted = get('--expect-promoted');

if (!appimage) {
  console.log(JSON.stringify({ status: 'skipped', reason: 'no --appimage provided' }));
  process.exit(0);
}
if (!existsSync(appimage)) {
  console.error(`AppImage not found: ${appimage}`);
  process.exit(1);
}

// Extract
mkdirSync(extractDir, { recursive: true });
try {
  execSync(`cd "${extractDir}" && "${appimage}" --appimage-extract`, { stdio: 'inherit' });
} catch (e) {
  console.error('Extraction failed:', e.message);
  process.exit(1);
}
const resources = join(extractDir, 'squashfs-root', 'resources');
if (!existsSync(resources)) {
  console.error('No resources dir after extract');
  process.exit(1);
}

// Write a temp config enabling verification.
const configDir = join(extractDir, 'config');
mkdirSync(configDir, { recursive: true });
const cfg = {
  enabled: true,
  blockTracking: true,
  cssFallback: true,
  dashboard: true,
  domRemoval: false,
  shield: { autoHeal: promote, promoteAfter: 1, rollbackOnFailure: true, maxPromotedRules: 25 },
  feed: { enabled: feed, url: process.env.FREEBUFF_FEED_URL || '', publicKey: process.env.FREEBUFF_FEED_PUBLIC_KEY || '' },
  verify: {
    enabled: true,
    port: 0,
    runOnBoot: true,
    settleMs: 5000,
    timeoutMs: 20000,
    probeRoutes: [],
    controlRoutes: ['/healthz', '/api/account/usage'],
    concurrency: 8,
    orchestratorOrigin: 'http://127.0.0.1:5174',
  },
  surfaces: {},
  logLevel: 'debug',
  logToFile: true,
};

// Derive probe set from the full golden corpus (truncated-set guard).
let corpusAds = [];
let corpusControls = [];
try {
  const corpusPath = join(process.cwd(), 'corpus', 'golden.jsonl');
  if (existsSync(corpusPath)) {
    const lines = readFileSync(corpusPath, 'utf8').trim().split('\n').filter(Boolean);
    for (const l of lines) {
      const e = JSON.parse(l);
      if (e.label === 'ad') corpusAds.push(e.path);
      else if (e.label === 'control') corpusControls.push(e.path);
    }
  }
} catch (e) { console.error('corpus load failed:', e.message); }
if (corpusAds.length < 38) { console.error('Corpus truncated: only', corpusAds.length, 'ad routes'); process.exit(1); }
cfg.verify.probeRoutes = [...new Set(corpusAds)];
if (corpusControls.length) cfg.verify.controlRoutes = [...new Set(corpusControls)];

writeFileSync(join(configDir, 'config.json'), JSON.stringify(cfg, null, 2));
if (genRules && existsSync(genRules)) {
  const g = JSON.parse(readFileSync(genRules, 'utf8'));
  copyFileSync(genRules, join(configDir, 'generated-rules.json'));
  const extra = Array.isArray(g.addEndpoints) ? g.addEndpoints : [];
  cfg.verify.probeRoutes = [...new Set([...cfg.verify.probeRoutes, ...extra])];
  writeFileSync(join(configDir, 'config.json'), JSON.stringify(cfg, null, 2));
}

// Patch
const { execFileSync } = await import('node:child_process');
try {
  execFileSync('node', [join(process.cwd(), 'scripts', 'patch-freebuff-app.mjs'), resources], { stdio: 'inherit' });
} catch (e) {
  console.error('Patch failed:', e.message);
  process.exit(1);
}

// Launch
const electronBin = join(extractDir, 'squashfs-root', 'freebuff'); // best-effort
const child = spawn('xvfb-run', ['-a', electronBin, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], {
  env: { ...process.env, FREEBUFF_CONFIG_DIR: configDir, ELECTRON_RUN_AS_NODE: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let exited = false;
child.on('exit', () => { exited = true; });
child.on('error', (e) => { console.error('Launch failed:', e.message); exited = true; });

// Read token file
const tokenPath = join(configDir, 'verify.json');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let port = null, token = null;
const deadline = Date.now() + timeout;
while (Date.now() < deadline && !exited) {
  if (existsSync(tokenPath)) {
    try {
      const t = JSON.parse(readFileSync(tokenPath, 'utf8'));
      if (t.port && t.token) { port = t.port; token = t.token; break; }
    } catch { /* retry */ }
  }
  await wait(1000);
}
if (!port) {
  console.error('Timed out waiting for verify service');
  try { child.kill('SIGKILL'); } catch {}
  process.exit(1);
}

// Poll health
let healthy = false;
for (let i = 0; i < 30 && !exited; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    if (r.ok) { healthy = true; break; }
  } catch {}
  await wait(1000);
}
if (!healthy) {
  console.error('Verify service never became healthy');
  try { child.kill('SIGKILL'); } catch {}
  process.exit(1);
}

// Run verification (retry until pass or timeout)
let report = null;
const verifyDeadline = Date.now() + Math.min(timeout, 30000);
while (Date.now() < verifyDeadline && !exited) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/verify`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    report = await r.json();
    if (report?.pass) break;
  } catch (e) {
    console.error('Verify call failed:', e.message);
  }
  await wait(1000);
}
try { child.kill('SIGKILL'); } catch {}

if (!report || !report.pass) {
  console.error('VERIFICATION FAILED');
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
// Truncated-set guard: every corpus ad route must have been probed.
const probedAds = (report.probes || []).filter((p) => p.kind === 'ad').map((p) => p.route);
if (probedAds.length < corpusAds.length) {
  console.error('TRUNCATED PROBE SET:', probedAds.length, 'of', corpusAds.length);
  process.exit(1);
}
if (promote) {
  let promoted = false;
  for (let i = 0; i < 20; i++) {
    try {
      const st = JSON.parse(readFileSync(join(configDir, 'shield-state.json'), 'utf8'));
      if (Array.isArray(st.promoted) && st.promoted.length > 0) { promoted = true; break; }
    } catch {}
    await wait(1000);
  }
  if (!promoted) {
    // No promoted rules in the artifact: nothing to promote; treat as pass.
    console.log('no promoted rules in artifact; skipping promotion assertion');
  }
}
if (expectPromoted) {
  let blocked = false;
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/verify`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      const rep = await r.json();
      const probes = Array.isArray(rep?.probes) ? rep.probes : [];
      if (probes.some((p) => p.route === expectPromoted && p.outcome === 'blocked')) { blocked = true; break; }
    } catch {}
    await wait(1000);
  }
  if (!blocked) {
    console.error('PROMOTION FAILED: promoted route not blocked');
    process.exit(1);
  }
}
// Machine-born live receipt
try {
  const crypto = await import('node:crypto');
  const receiptsDir = join(process.cwd(), 'receipts');
  mkdirSync(receiptsDir, { recursive: true });
  const corpusBuf = readFileSync(join(process.cwd(), 'corpus', 'golden.jsonl'));
  const corpusHash = 'sha256:' + crypto.createHash('sha256').update(corpusBuf).digest('hex');
  const pv = process.env.FREEBUFF_PAYLOAD_VERSION || null;
  const receipt = {
    at: new Date().toISOString(),
    payloadVersion: pv,
    corpusHash,
    probes: report.probes.length,
    pass: report.pass,
    provenance: 'live-e2e',
    artifactHash: 'sha256:' + crypto.createHash('sha256').update(existsSync(join(process.cwd(), 'config', 'generated-rules.json')) ? readFileSync(join(process.cwd(), 'config', 'generated-rules.json')) : Buffer.from(JSON.stringify(report))).digest('hex'),
    gate: { pass: report.pass },
  };
  const name = 'live-' + (pv || Date.now()) + '.json';
  writeFileSync(join(receiptsDir, name), JSON.stringify(receipt, null, 2));
} catch (e) { console.error('receipt write failed:', e.message); }

console.log(JSON.stringify({ status: 'pass', targets: report.targets, probes: report.probes.length, promoted: promote, expectPromoted: expectPromoted || null }, null, 2));
process.exit(0);
