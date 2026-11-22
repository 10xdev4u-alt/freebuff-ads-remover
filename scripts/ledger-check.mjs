import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PINNED_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAXPPjDp264OD7EOmZY7//cV2rXyP1rNbWnJvHu2I34EI=\n-----END PUBLIC KEY-----';

function defaultRunVitest(root) {
  try {
    return { code: 0, out: execSync('npx vitest run 2>&1', { cwd: root, encoding: 'utf8' }) };
  } catch (e) {
    return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') };
  }
}

async function defaultVerifyManifest(manifest, publicKey) {
  const { verifyManifest } = await import('../dist/feed.js');
  return verifyManifest(manifest, publicKey);
}

function readJson(file) {
  try { return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) }; }
  catch { return { ok: false, value: null }; }
}

// NaN for a missing or unparseable timestamp, so a freshness check cannot be
// skipped by omitting the field.
function ageMs(ts) {
  const t = Date.parse(ts);
  return Number.isFinite(t) ? Date.now() - t : NaN;
}

function receiptList(root, dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, path: path.join(abs, f), ...readJson(path.join(abs, f)) }));
}

// Verify the repo's self-consistency claims. Returns { ok, findings, warnings }.
// `deps.runVitest` and `deps.verifyManifest` are injectable so the gate can be
// self-tested without a built dist or a real test run.
export async function checkLedger(root, deps = {}) {
  const runVitest = deps.runVitest || (() => defaultRunVitest(root));
  const verifyManifest = deps.verifyManifest || defaultVerifyManifest;
  const findings = [];
  const warnings = [];
  const fail = (msg) => findings.push(msg);
  const warn = (msg) => warnings.push(msg);
  const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
  const exists = (rel) => fs.existsSync(path.join(root, rel));

  // README test count must match vitest
  const readme = read('README.md');
  let testCount = NaN;
  let testFiles = 0;
  try { testFiles = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.ts')).length; } catch {}
  const vitest = runVitest();
  const clean = String(vitest.out || '').replace(/\x1b\[[0-9;]*m/g, '');
  const mm = clean.match(/Tests\s+(\d+)\s+passed/);
  if (mm) testCount = parseInt(mm[1], 10);
  if (vitest.code !== 0) fail(`vitest exited ${vitest.code}`);
  if (isNaN(testCount)) fail(`vitest produced no parseable test count (exit ${vitest.code})`);
  const m = readme.match(/vitest, (\d+) tests/);
  if (!m || parseInt(m[1], 10) !== testCount) {
    fail(`README test count ${m?.[1]} != actual ${testCount}`);
  }

  // corpus manifest hash
  const corpusPath = path.join(root, 'corpus', 'golden.jsonl');
  const crypto = await import('node:crypto');
  const corpusBuf = fs.readFileSync(corpusPath);
  const hash = crypto.createHash('sha256').update(corpusBuf).digest('hex');
  const manifest = readJson(path.join(root, 'corpus', 'manifest.json'));
  if (!manifest.ok) fail('corpus manifest unreadable');
  else if (hash !== manifest.value.sha256) fail('corpus manifest hash mismatch');

  // Heal receipt verification (required when the artifact carries promoted rules)
  const receiptsDir = 'receipts';
  let artifact = null;
  const artifactPath = path.join(root, 'config', 'generated-rules.json');
  if (exists('config/generated-rules.json')) {
    const parsed = readJson(artifactPath);
    if (parsed.ok) artifact = parsed.value;
  }
  const hasHeal = !!artifact && ((Array.isArray(artifact.addEndpoints) && artifact.addEndpoints.length > 0) || (artifact.addSelectors && Object.keys(artifact.addSelectors).length > 0));
  if (hasHeal) {
    if (!exists(receiptsDir)) fail('heal receipt required but receipts/ missing');
    const artifactHash = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
    let matched = false;
    for (const r of receiptList(root, receiptsDir)) {
      if (!r.ok) { fail('receipt unreadable: ' + r.file); continue; }
      if (r.value.artifactHash === artifactHash) {
        matched = true;
        if (!r.value.gate?.pass) fail('heal receipt gate not pass');
        if (!r.value.provenance) fail('heal receipt missing provenance');
        if (r.value.corpusHash !== 'sha256:' + hash) fail('heal receipt corpus hash mismatch');
      }
    }
    if (!matched) fail('no heal receipt matching current artifact');
  }

  // Landing truth-pass
  const landing = read('index.html');
  const lm = landing.match(/✓\s+(\d+)\s+tests passed · (\d+)\s+files/);
  if (!lm) fail('landing test count not found');
  else {
    if (parseInt(lm[1], 10) !== testCount) fail(`landing test count ${lm[1]} != actual ${testCount}`);
    if (parseInt(lm[2], 10) !== testFiles) fail(`landing file count ${lm[2]} != actual ${testFiles}`);
  }
  // Landing receipt hash must match the real receipt
  const landingHashMatch = landing.match(/hash:'(sha256:[0-9a-f]+)'/);
  if (landingHashMatch) {
    const hashes = receiptList(root, receiptsDir).filter((r) => r.ok).map((r) => r.value.artifactHash);
    if (!hashes.includes(landingHashMatch[1])) fail('landing receipt hash does not match any receipt');
  }

  // Every receipt must carry provenance
  for (const r of receiptList(root, receiptsDir)) {
    if (!r.ok) { fail('receipt unreadable: ' + r.file); continue; }
    if (!r.value.provenance) fail('receipt missing provenance: ' + r.file);
  }

  // Payload-drift baseline must be real and current
  const baselinePath = path.join(root, 'config', 'endpoint-baseline.json');
  if (!exists('config/endpoint-baseline.json')) {
    fail('endpoint baseline missing');
  } else {
    const b = readJson(baselinePath);
    if (!b.ok) {
      fail('endpoint baseline unreadable');
    } else {
      const baseline = b.value;
      if (!Array.isArray(baseline.routes) || baseline.routes.length === 0) fail('endpoint baseline has no routes');
      const withVersion = receiptList(root, receiptsDir)
        .filter((r) => r.ok && r.value.payloadVersion)
        .sort((a, c) => String(c.value.at || '').localeCompare(String(a.value.at || '')))[0];
      const latest = withVersion?.value;
      if (latest && baseline.payloadVersion && baseline.payloadVersion !== latest.payloadVersion) {
        fail('endpoint baseline payloadVersion mismatch');
      }
      const corpusVersion = manifest.ok ? manifest.value.freebuffVersion : undefined;
      if (latest && corpusVersion && latest.payloadVersion !== corpusVersion) {
        fail('corpus manifest version mismatch');
      }
      if (baseline.payloadVersion && corpusVersion && baseline.payloadVersion !== corpusVersion) {
        fail('baseline/corpus version mismatch');
      }
      if (baseline.generatedAt) {
        const age = Date.now() - Date.parse(baseline.generatedAt);
        if (age > 7 * 24 * 60 * 60 * 1000) warn('endpoint baseline is stale');
      }
    }
  }

  // Live receipt: the shipped artifact must be backed by a passing live-e2e run.
  const liveReceipts = receiptList(root, receiptsDir)
    .filter((r) => r.file.startsWith('live-') && r.ok);
  if (liveReceipts.length === 0) {
    fail('no live-e2e receipt present (run e2e-headless --feed to generate)');
  } else {
    const latestLive = liveReceipts
      .slice()
      .sort((a, c) => String(c.value.at || '').localeCompare(String(a.value.at || '')))[0].value;
    if (latestLive.payloadVersion === null || latestLive.payloadVersion === undefined) {
      fail('live receipt has null payloadVersion');
    }
    // A missing or unparseable timestamp must not read as fresh.
    const liveAge = ageMs(latestLive.at);
    if (!Number.isFinite(liveAge)) fail('live receipt has a missing or invalid timestamp');
    else if (liveAge > 7 * 24 * 60 * 60 * 1000) fail('live receipt is stale (>7d)');
    if (latestLive.provenance !== 'live-e2e') fail('live receipt missing provenance: live-e2e');
    if (latestLive.pass !== true) fail('live receipt did not pass');
    if (!Number.isFinite(latestLive.probes) || latestLive.probes <= 0) fail('live receipt has no probes');
    // The live receipt must describe the artifact currently shipped: a passing
    // run for artifact A must not green-light artifact B.
    if (!exists('config/generated-rules.json')) {
      fail('live receipt present but config/generated-rules.json is missing');
    } else {
      const liveArtifactHash = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
      if (latestLive.artifactHash !== liveArtifactHash) {
        fail('live receipt artifactHash does not match config/generated-rules.json');
      }
    }
  }

  // Feed manifest must exist, parse, and verify against the pinned public key
  if (!exists('feed/manifest.json')) {
    fail('feed/manifest.json missing');
  } else {
    const fm = readJson(path.join(root, 'feed', 'manifest.json'));
    if (!fm.ok) {
      fail('feed manifest unreadable');
    } else {
      const value = fm.value;
      let valid = false;
      try { valid = await verifyManifest(value, PINNED_PUBLIC_KEY); } catch (e) { valid = false; fail('feed manifest verify threw: ' + e.message); }
      if (!valid) fail('feed manifest signature invalid');
      const feedAge = ageMs(value.generatedAt);
      if (!Number.isFinite(feedAge)) fail('feed manifest has a missing or invalid generatedAt');
      else if (feedAge > 7 * 24 * 60 * 60 * 1000) fail('feed manifest stale (>7d)');
      // feed healHash must match a committed receipt
      const hashes = receiptList(root, receiptsDir).filter((r) => r.ok).map((r) => r.value.artifactHash);
      if (value.entries && value.entries[0] && !hashes.includes(value.entries[0].healHash)) {
        fail('feed healHash does not match any committed receipt');
      }
    }
  }

  // Live proof page must exist
  if (!exists('live-proof/index.html')) fail('live-proof/index.html missing');

  // Version drift: README badge == package.json == top CHANGELOG
  const pkg = readJson(path.join(root, 'package.json'));
  if (!pkg.ok) fail('package.json unreadable');
  else {
    const pkgVersion = pkg.value.version;
    const readmeBadge = readme.match(/version-(\d+\.\d+\.\d+)-blue/);
    if (readmeBadge && readmeBadge[1] !== pkgVersion) fail(`README badge ${readmeBadge[1]} != package ${pkgVersion}`);
    const changelog = read('CHANGELOG.md');
    const changelogTop = changelog.match(/## \[(\d+\.\d+\.\d+)\]/);
    if (changelogTop && changelogTop[1] !== pkgVersion) fail(`CHANGELOG top ${changelogTop[1]} != package ${pkgVersion}`);
  }

  return { ok: findings.length === 0, findings, warnings };
}
