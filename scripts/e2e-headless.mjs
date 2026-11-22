#!/usr/bin/env node
/**
 * Headless end-to-end verification of the Freebuff Ads Remover against a real
 * Freebuff AppImage. Extracts the AppImage, patches it, launches Electron
 * under xvfb, and asserts the in-app RuntimeVerifier reports pass:true.
 * With --feed it applies the signed feed to the extracted config first, the
 * way the launcher does, and probes the routes that feed delivered.
 *
 * Usage:
 *   node scripts/e2e-headless.mjs --appimage <path> [--extract-dir <dir>] [--timeout <ms>]
 *
 * Exits 0 on success, or 0 with --allow-skip when --appimage is omitted.
 * Exits 2 for a missing --appimage, a missing --feed env, or bad arguments.
 * Exits 1 on any verification failure.
 */
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, execSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { copyFileSync, readFileSync } from 'node:fs';
import { applyFeed } from './feed-apply.mjs';

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
  if (args.includes('--allow-skip')) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'no --appimage provided' }));
    process.exit(0);
  }
  // A missing or misspelled --appimage must not look like a passing run.
  console.error('no --appimage provided (pass --allow-skip to skip explicitly)');
  process.exit(2);
}
if (feed && (!process.env.FREEBUFF_FEED_URL || !process.env.FREEBUFF_FEED_PUBLIC_KEY)) {
  console.error('--feed requires FREEBUFF_FEED_URL and FREEBUFF_FEED_PUBLIC_KEY');
  process.exit(2);
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

// Write a temp config enabling verification. Start clean: a reused extract dir
// carries a stale verify.json (pointing at a dead port) and a stale crash
// counter that makes the extension refuse to activate.
const configDir = join(extractDir, 'config');
rmSync(configDir, { recursive: true, force: true });
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

// Apply the signed feed exactly as the launcher does, then probe the routes it
// delivered. `--feed` used to only set a config field nothing reads, so the
// workflow's "feed was applied" guard could never pass and the flag proved
// nothing.
if (feed) {
  let applied;
  try {
    applied = applyFeed({
      manifest: process.env.FREEBUFF_FEED_URL,
      configDir,
      publicKey: process.env.FREEBUFF_FEED_PUBLIC_KEY,
      previousPublicKey: process.env.FREEBUFF_FEED_PREVIOUS_PUBLIC_KEY || '',
    });
  } catch (e) {
    console.error('feed apply failed:', e.message);
    process.exit(1);
  }
  if (applied.extraEndpoints.length) {
    cfg.verify.probeRoutes = [...new Set([...cfg.verify.probeRoutes, ...applied.extraEndpoints])];
    writeFileSync(join(configDir, 'config.json'), JSON.stringify(cfg, null, 2));
  }
  console.log(JSON.stringify({ feed: 'applied', healHash: applied.receipt.healHash, extraEndpoints: applied.extraEndpoints.length }));
}

// Patch
try {
  execFileSync('node', [join(process.cwd(), 'scripts', 'patch-freebuff-app.mjs'), resources], { stdio: 'inherit' });
} catch (e) {
  console.error('Patch failed:', e.message);
  process.exit(1);
}

// Launch. The app gets its own Electron profile and orchestrator state dir:
// sharing the desktop profile opens the user's real window, and sharing the
// state dir makes the orchestrator exit with "another orchestrator is already
// using this Desktop state profile".
const electronBin = join(extractDir, 'squashfs-root', 'freebuff'); // best-effort
const profileDir = join(extractDir, 'profile');
const stateDir = join(extractDir, 'state');
rmSync(profileDir, { recursive: true, force: true });
rmSync(stateDir, { recursive: true, force: true });
mkdirSync(profileDir, { recursive: true });
mkdirSync(stateDir, { recursive: true });

const child = spawn(
  'xvfb-run',
  ['-a', electronBin, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--ozone-platform=x11', `--user-data-dir=${profileDir}`],
  {
    env: {
      ...process.env,
      FREEBUFF_CONFIG_DIR: configDir,
      FREEBUFF_DESKTOP_STATE_PATH: stateDir,
      ELECTRON_RUN_AS_NODE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  },
);
let exited = false;
child.on('exit', () => { exited = true; });
child.on('error', (e) => { console.error('Launch failed:', e.message); exited = true; });

// Drain both pipes. An undrained pipe fills its 64 KiB buffer and stalls the
// app, and closing our read end while the app still writes is what raises the
// EPIPE that Electron shows as an uncaught-exception dialog.
let logTail = '';
const remember = (chunk) => { logTail = (logTail + chunk.toString()).slice(-8000); };
child.stdout?.on('data', remember);
child.stderr?.on('data', remember);

// xvfb-run is only the direct child; Xvfb and Electron are its descendants.
// detached:true makes it a process-group leader, so one signal reaps the tree
// instead of orphaning Electron on the real display.
const killTree = () => {
  if (child.pid === undefined) return;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
};
const fail = (message) => {
  console.error(message);
  if (logTail.trim()) console.error('--- app output tail ---\n' + logTail.trim());
  killTree();
  process.exit(1);
};

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
if (!port) fail('Timed out waiting for verify service');

// Poll health. fetch() has no default timeout, so an unresponsive app would
// stall the run instead of failing it.
let healthy = false;
for (let i = 0; i < 30 && !exited; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) { healthy = true; break; }
  } catch {}
  await wait(1000);
}
if (!healthy) fail('Verify service never became healthy');

// Run verification (retry until pass or timeout)
let report = null;
const verifyDeadline = Date.now() + Math.min(timeout, 30000);
while (Date.now() < verifyDeadline && !exited) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
    });
    report = await r.json();
    if (report?.pass) break;
  } catch (e) {
    console.error('Verify call failed:', e.message);
  }
  await wait(1000);
}

if (!report || !report.pass) {
  console.error('VERIFICATION FAILED');
  console.error(JSON.stringify(report, null, 2));
  if (logTail.trim()) console.error('--- app output tail ---\n' + logTail.trim());
  killTree();
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
  if (!promoted) fail('PROMOTION FAILED: no promoted rules');
}
if (expectPromoted) {
  let blocked = false;
  for (let i = 0; i < 20; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/verify`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20000),
      });
      const rep = await r.json();
      const probes = Array.isArray(rep?.probes) ? rep.probes : [];
      if (probes.some((p) => p.route === expectPromoted && p.outcome === 'blocked')) { blocked = true; break; }
    } catch {}
    await wait(1000);
  }
  if (!blocked) {
    console.error('PROMOTION FAILED: promoted route not blocked');
    killTree();
    process.exit(1);
  }
}
// The app is still running for the --expect-promoted check above; reap the
// whole tree only once we are done with it.
killTree();
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
} catch (e) { console.error('receipt write failed:', e.message); process.exit(1); }

console.log(JSON.stringify({ status: 'pass', targets: report.targets, probes: report.probes.length, promoted: promote, expectPromoted: expectPromoted || null }, null, 2));
process.exit(0);
