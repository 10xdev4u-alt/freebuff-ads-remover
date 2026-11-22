#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const payloadDir = args.includes('--payload') ? args[args.indexOf('--payload')+1] : null;
const receiptOut = args.includes('--receipt-out') ? args[args.indexOf('--receipt-out')+1] : null;

function fail(stage, msg) { console.error('DRILL FAIL [' + stage + ']:', msg); process.exit(1); }
function log(o) { if (jsonMode) console.log(JSON.stringify(o)); else console.log(o); }

const repoRoot = process.cwd();
const work = fs.mkdtempSync(path.join(tmpdir(), 'loop-drill-'));
const drillRoute = '/api/ad/drill-' + new Date().toISOString().slice(0,10).replace(/-/g,'');
const drillSelector = '.drill-ad-' + Date.now();

// Stage 1: inject a synthetic ad route into a copy of the payload (fixture mode)
const fixtureDir = path.join(repoRoot, 'tests', 'fixtures', 'payload-gap');
let srcDir = payloadDir;
if (!srcDir) {
  if (!fs.existsSync(fixtureDir)) { console.error('no payload or fixture'); process.exit(2); }
  srcDir = path.join(fixtureDir, 'resources');
}
// copy
const target = path.join(work, 'payload');
fs.mkdirSync(target, { recursive: true });
fs.cpSync(srcDir, target, { recursive: true });

// inject route into a mock audit by writing a missing-routes override? 
// Instead, we simulate: run audit, expect failure on the synthetic route.
// For fixture mode, just run self-heal against the fixture and assert non-empty delta.

const auditOut = path.join(work, 'audit.json');
try {
  execSync(`node scripts/audit-endpoints.mjs "${target}" --json > "${auditOut}"`, { stdio: 'pipe' });
} catch { /* audit may exit non-zero on gaps; ok */ }

let audit = {};
try { audit = JSON.parse(fs.readFileSync(auditOut, 'utf8')); } catch { audit = { routes: { missing: [] } }; }

// Stage 2: self-heal
const genRules = path.join(work, 'generated-rules.json');
const receipt = path.join(work, 'receipt.json');
const healExit = (() => {
  try {
    execSync(`node scripts/self-heal.mjs --resources "${target}" --out "${genRules}" --receipt "${receipt}" --payload-version 0.0.204 --provenance drill --json`, { stdio: 'pipe' });
    return 0;
  } catch (e) { return e.status ?? 1; }
})();
if (healExit !== 0) fail('heal', 'self-heal exited ' + healExit);

const artifact = JSON.parse(fs.readFileSync(genRules, 'utf8'));
const delta = (Array.isArray(artifact.addEndpoints) ? artifact.addEndpoints.length : 0)
  + (artifact.addSelectors && typeof artifact.addSelectors === 'object' ? Object.keys(artifact.addSelectors).length : 0);
// A drill exists to prove the loop finds a real gap. An empty delta means the
// fixture was already healed or the audit saw nothing, and passing that off as
// a drill result is exactly the tautology this gate exists to catch.
if (delta === 0) fail('heal', 'empty heal delta');

// Stage 3: feed-build + sign
const manifest = path.join(work, 'manifest.json');
try {
  execSync(`node scripts/feed-build.mjs --artifact "${genRules}" --receipts "${path.dirname(receipt)}" --out "${manifest}" --version 1`, { stdio: 'pipe' });
} catch (e) { fail('feed-build', e.message); }

// sign
const privKey = process.env.FEED_SIGNING_PRIVATE_KEY || fs.readFileSync('/tmp/feed-private.pem','utf8');
fs.writeFileSync(path.join(work,'priv.pem'), privKey);
try {
  execSync(`FEED_SIGNING_PRIVATE_KEY="$(cat ${path.join(work,'priv.pem')})" node scripts/feed-sign.mjs --in "${manifest}" --out "${manifest}"`, { stdio: 'pipe', shell: true });
} catch (e) { fail('feed-sign', e.message); }

// Stage 4: feed-sync
const cfgDir = path.join(work, 'cfg');
fs.mkdirSync(cfgDir, { recursive: true });
const pubKey = (await import('node:crypto')).createPublicKey(privKey).export({ type:'spki', format:'pem' });
try {
  execSync(`FEED_PUBLIC_KEY="${pubKey}" node scripts/feed-sync.mjs --manifest "${manifest}" --config-dir "${cfgDir}"`, { stdio: 'pipe', shell: true, env: { ...process.env, FEED_PUBLIC_KEY: pubKey } });
} catch (e) { fail('feed-sync', e.message); }

const feedRules = path.join(cfgDir, 'feed-rules.json');
if (!fs.existsSync(feedRules)) fail('feed-sync', 'feed-rules.json not created');

// write drill receipt to a temp path by default: the drill must not dirty the
// repo it runs against.
let healReceipt = {};
try { healReceipt = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch {}
const drillReceiptPath = receiptOut || path.join(work, 'drill-receipt.json');
const drillReceipt = { at: new Date().toISOString(), stage: 'complete', payload: srcDir, healHash: healReceipt.artifactHash || 'unknown', delta, provenance: 'drill' };
fs.writeFileSync(drillReceiptPath, JSON.stringify(drillReceipt, null, 2));

log({ status: 'pass', work, drillRoute, healExit, delta, receipt: drillReceiptPath });
