import fs from 'node:fs';
import { execSync } from 'node:child_process';

let ok = true;
function fail(msg) { console.error('LEDGER FAIL:', msg); ok = false; }

// README test count must match vitest
const readme = fs.readFileSync('README.md', 'utf8');
let testCount = NaN;
let testFiles = fs.readdirSync('tests').filter((f) => f.endsWith('.test.ts')).length;
let out = '';
try { out = execSync('npx vitest run 2>&1', { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || '') + String(e.stderr || ''); }
const clean = out.replace(/\x1b\[[0-9;]*m/g, '');
const mm = clean.match(/Tests\s+(\d+)\s+passed/);
if (mm) testCount = parseInt(mm[1], 10);
const m = readme.match(/vitest, (\d+) tests/);
if (isNaN(testCount) || !m || parseInt(m[1], 10) !== testCount) {
  fail(`README test count ${m?.[1]} != actual ${testCount}`);
}

// corpus manifest hash
const corpus = fs.readFileSync('corpus/golden.jsonl');
const crypto = await import('node:crypto');
const hash = crypto.createHash('sha256').update(corpus).digest('hex');
const manifest = JSON.parse(fs.readFileSync('corpus/manifest.json', 'utf8'));
if (hash !== manifest.sha256) fail('corpus manifest hash mismatch');



// Heal receipt verification (required when the artifact carries promoted rules)
const receiptsDir = 'receipts';
let artifact = null;
try { artifact = JSON.parse(fs.readFileSync('config/generated-rules.json', 'utf8')); } catch { artifact = null; }
const hasHeal = !!artifact && ((Array.isArray(artifact.addEndpoints) && artifact.addEndpoints.length > 0) || (artifact.addSelectors && Object.keys(artifact.addSelectors).length > 0));
if (hasHeal) {
  if (!fs.existsSync(receiptsDir)) fail('heal receipt required but receipts/ missing');
  const files = fs.existsSync(receiptsDir) ? fs.readdirSync(receiptsDir).filter((f) => f.endsWith('.json')) : [];
  const artifactText = fs.readFileSync('config/generated-rules.json');
  const artifactHash = 'sha256:' + crypto.createHash('sha256').update(artifactText).digest('hex');
  let matched = false;
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(receiptsDir + '/' + f, 'utf8'));
    if (r.artifactHash === artifactHash) {
      matched = true;
      if (!r.gate?.pass) fail('heal receipt gate not pass');
      if (!r.provenance) fail('heal receipt missing provenance');
      const corpusHash = crypto.createHash('sha256').update(fs.readFileSync('corpus/golden.jsonl')).digest('hex');
      if (r.corpusHash !== 'sha256:' + corpusHash) fail('heal receipt corpus hash mismatch');
    }
  }
  if (!matched) fail('no heal receipt matching current artifact');
}

// Landing truth-pass
const landing = fs.readFileSync('index.html', 'utf8');
const lm = landing.match(/✓\s+(\d+)\s+tests passed · (\d+)\s+files/);
if (!lm) fail('landing test count not found');
else {
  if (parseInt(lm[1], 10) !== testCount) fail(`landing test count ${lm[1]} != actual ${testCount}`);
  if (parseInt(lm[2], 10) !== testFiles) fail(`landing file count ${lm[2]} != actual ${testFiles}`);
}
// Landing receipt hash must match the real receipt
const landingHashMatch = landing.match(/hash:'(sha256:[0-9a-f]+)'/);
if (landingHashMatch) {
  const receiptFiles = fs.existsSync('receipts') ? fs.readdirSync('receipts').filter((f) => f.endsWith('.json')) : [];
  const hashes = receiptFiles.map((f) => JSON.parse(fs.readFileSync('receipts/' + f, 'utf8')).artifactHash);
  if (!hashes.includes(landingHashMatch[1])) fail('landing receipt hash does not match any receipt');
}

// Every receipt must carry provenance
const receiptFiles2 = fs.existsSync('receipts') ? fs.readdirSync('receipts').filter((f) => f.endsWith('.json')) : [];
for (const f of receiptFiles2) {
  const r = JSON.parse(fs.readFileSync('receipts/' + f, 'utf8'));
  if (!r.provenance) fail('receipt missing provenance: ' + f);
}

// Payload-drift baseline must be real and current
const baselinePath = 'config/endpoint-baseline.json';
if (fs.existsSync(baselinePath)) {
  try {
    const b = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    if (!Array.isArray(b.routes) || b.routes.length === 0) fail('endpoint baseline has no routes');
    const receiptFiles = fs.existsSync('receipts') ? fs.readdirSync('receipts').filter((f) => f.endsWith('.json')) : [];
    const latest = receiptFiles
      .map((f) => JSON.parse(fs.readFileSync('receipts/' + f, 'utf8')))
      .filter((r) => r.payloadVersion)
      .sort((a, c) => String(c.at || '').localeCompare(String(a.at || '')))[0];
    if (latest && b.payloadVersion && b.payloadVersion !== latest.payloadVersion) {
      fail('endpoint baseline payloadVersion mismatch');
    }
    if (b.generatedAt) {
      const age = Date.now() - Date.parse(b.generatedAt);
      if (age > 7 * 24 * 60 * 60 * 1000) console.error('LEDGER WARN: endpoint baseline is stale');
    }
  } catch {
    fail('endpoint baseline unreadable');
  }
} else {
  fail('endpoint baseline missing');
}

// Live receipt freshness (warning-level; full enforcement requires a real AppImage run)
const liveReceipts = fs.existsSync('receipts') ? fs.readdirSync('receipts').filter((f) => f.startsWith('live-') && f.endsWith('.json')) : [];
if (liveReceipts.length === 0) {
  console.error('LEDGER WARN: no live-e2e receipt present (run e2e-headless --feed to generate)');
} else {
  const latestLive = liveReceipts
    .map((f) => JSON.parse(fs.readFileSync('receipts/' + f, 'utf8')))
    .sort((a, c) => String(c.at || '').localeCompare(String(a.at || '')))[0];
  if (latestLive.payloadVersion === null || latestLive.payloadVersion === undefined) {
    fail('live receipt has null payloadVersion');
  }
  if (latestLive.at) {
    const age = Date.now() - Date.parse(latestLive.at);
    if (age > 7 * 24 * 60 * 60 * 1000) fail('live receipt is stale (>7d)');
  }
  if (latestLive.provenance !== 'live-e2e') fail('live receipt missing provenance: live-e2e');
}


// Feed manifest must exist, parse, and verify against the pinned public key
const feedPath = 'feed/manifest.json';
if (!fs.existsSync(feedPath)) {
  fail('feed/manifest.json missing');
} else {
  try {
    const fm = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
    const pub = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAV9Zst2Z+TZ0UjmZgUhacxR2+gaIUyh3JozsNNNb/0CI=\n-----END PUBLIC KEY-----';
    const { verifyManifest } = await import('../dist/feed.js');
    if (!verifyManifest(fm, pub)) fail('feed manifest signature invalid');
    if (fm.generatedAt) {
      const age = Date.now() - Date.parse(fm.generatedAt);
      if (age > 7 * 24 * 60 * 60 * 1000) fail('feed manifest stale (>7d)');
    }
    // feed healHash must match a committed receipt
    const receiptFiles = fs.existsSync('receipts') ? fs.readdirSync('receipts').filter((f) => f.endsWith('.json')) : [];
    const hashes = receiptFiles.map((f) => JSON.parse(fs.readFileSync('receipts/' + f, 'utf8')).artifactHash);
    if (fm.entries && fm.entries[0] && !hashes.includes(fm.entries[0].healHash)) {
      fail('feed healHash does not match any committed receipt');
    }
  } catch (e) { fail('feed manifest unreadable: ' + e.message); }
}

// Live proof page must exist
if (!fs.existsSync('live-proof/index.html')) fail('live-proof/index.html missing');

// Version drift: README badge == package.json == top CHANGELOG
const pkgVersion = JSON.parse(fs.readFileSync('package.json','utf8')).version;
const readmeBadge = readme.match(/version-(\d+\.\d+\.\d+)-blue/);
if (readmeBadge && readmeBadge[1] !== pkgVersion) fail(`README badge ${readmeBadge[1]} != package ${pkgVersion}`);
const changelogTop = fs.readFileSync('CHANGELOG.md','utf8').match(/## \[(\d+\.\d+\.\d+)\]/);
if (changelogTop && changelogTop[1] !== pkgVersion) fail(`CHANGELOG top ${changelogTop[1]} != package ${pkgVersion}`);

console.log(ok ? 'LEDGER OK' : 'LEDGER FAILED');
process.exit(ok ? 0 : 1);
