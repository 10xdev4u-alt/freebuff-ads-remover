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

const args = process.argv.slice(2);
function get(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const appimage = get('--appimage');
const extractDir = resolve(get('--extract-dir') || join(tmpdir(), 'far-e2e-extract'));
const timeout = Number(get('--timeout') || 120000);

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
  verify: {
    enabled: true,
    port: 0,
    runOnBoot: true,
    settleMs: 5000,
    timeoutMs: 20000,
    probeRoutes: ['/api/ad/policy', '/api/ad/break', '/api/ad/billboard'],
    controlRoutes: ['/healthz', '/api/account/usage'],
    concurrency: 4,
    orchestratorOrigin: 'http://127.0.0.1:5174',
  },
  surfaces: {},
  logLevel: 'debug',
  logToFile: true,
};
writeFileSync(join(configDir, 'config.json'), JSON.stringify(cfg, null, 2));

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
  env: { ...process.env, FREEBUFF_CONFIG_DIR: configDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let exited = false;
child.on('exit', () => { exited = true; });

// Read token file
const tokenPath = join(configDir, 'verify.json');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let port = null, token = null;
const deadline = Date.now() + timeout;
while (Date.now() < deadline && !exited) {
  if (existsSync(tokenPath)) {
    try {
      const t = JSON.parse(require('node:fs').readFileSync(tokenPath, 'utf8'));
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

// Run verification
let report = null;
try {
  const r = await fetch(`http://127.0.0.1:${port}/verify`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  report = await r.json();
} catch (e) {
  console.error('Verify call failed:', e.message);
}
try { child.kill('SIGKILL'); } catch {}

if (!report || !report.pass) {
  console.error('VERIFICATION FAILED');
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'pass', targets: report.targets, probes: report.probes.length }, null, 2));
process.exit(0);
