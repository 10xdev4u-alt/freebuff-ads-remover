import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PINNED_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAXPPjDp264OD7EOmZY7//cV2rXyP1rNbWnJvHu2I34EI=\n-----END PUBLIC KEY-----';

function defaultRunVitest(root) {
  try {
    // Coverage is on because the landing page states a coverage figure; the
    // ledger cannot verify a claim it never measures.
    return { code: 0, out: execSync('npx vitest run --coverage 2>&1', { cwd: root, encoding: 'utf8' }) };
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
  const hasHeal = !!artifact && ((Array.isArray(artifact.addEndpoints) && artifact.addEndpoints.length > 0) || (Array.isArray(artifact.addHosts) && artifact.addHosts.length > 0) || (artifact.addSelectors && Object.keys(artifact.addSelectors).length > 0));
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
  let latestLive = null;
  const liveReceipts = receiptList(root, receiptsDir)
    .filter((r) => r.file.startsWith('live-') && r.ok);
  if (liveReceipts.length === 0) {
    fail('no live-e2e receipt present (run e2e-headless --feed to generate)');
  } else {
    latestLive = liveReceipts
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

  // Live proof page must exist and embed a real receipt: CI publishes it from
  // receipts/, so a page matching no committed receipt is a hand-written claim.
  if (!exists('live-proof/index.html')) {
    fail('live-proof/index.html missing');
  } else {
    const lp = read('live-proof/index.html');
    const embedded = lp.match(/<pre>([\s\S]*?)<\/pre>/);
    if (!embedded) {
      fail('live-proof page has no embedded receipt');
    } else {
      let value = null;
      try { value = JSON.parse(embedded[1]); } catch { fail('live-proof receipt is not valid JSON'); }
      if (value) {
        // Compare the page's own claims field-by-field, not just the two values
        // a copyist would lift from the public receipt: a page that copies
        // `at`/`artifactHash` but fabricates `pass` or `probes` must not match.
        const real = value.pass === true
          && value.provenance === 'live-e2e'
          && receiptList(root, receiptsDir).some((r) => r.ok
            && r.file.startsWith('live-')
            && r.value.at === value.at
            && r.value.artifactHash === value.artifactHash
            && r.value.pass === value.pass
            && r.value.provenance === value.provenance
            && r.value.payloadVersion === value.payloadVersion
            && r.value.probes === value.probes
            && r.value.corpusHash === value.corpusHash);
        if (!real) fail('live-proof page does not match a committed passing live-e2e receipt');
        else if (value.corpusHash && value.corpusHash !== 'sha256:' + hash) {
          warn('live-proof page describes an older corpus; the nightly publish refreshes it');
        }
      }
    }
  }

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

  // Release marker: release/last-cut.json is the dedupe key for release cuts,
  // so it must name package.json's version and a committed, passing live-e2e
  // receipt matching the recorded pair.
  if (!exists('release/last-cut.json')) {
    fail('release/last-cut.json missing');
  } else {
    const marker = readJson(path.join(root, 'release', 'last-cut.json'));
    if (!marker.ok) fail('release/last-cut.json unreadable');
    else {
      const m = marker.value;
      if (pkg.ok && m?.version !== pkg.value?.version) {
        fail(`release marker version ${JSON.stringify(m?.version)} != package ${pkg.value?.version}`);
      }
      const rel = typeof m?.receipt === 'string' ? m.receipt : '';
      if (!rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
        fail(`release marker receipt path ${JSON.stringify(m?.receipt)} is invalid`);
      } else {
        const mr = readJson(path.join(root, rel));
        if (!mr.ok) fail(`release marker receipt ${rel} is missing or corrupt`);
        else {
          if (mr.value?.payloadVersion !== m?.payloadVersion) {
            fail(`release marker payloadVersion ${JSON.stringify(m?.payloadVersion)} != receipt ${JSON.stringify(mr.value?.payloadVersion)}`);
          }
          if (mr.value?.artifactHash !== m?.artifactHash) {
            fail(`release marker artifactHash ${JSON.stringify(m?.artifactHash)} != receipt ${JSON.stringify(mr.value?.artifactHash)}`);
          }
          if (mr.value?.pass !== true) fail('release marker receipt did not pass');
          if (mr.value?.provenance !== 'live-e2e') fail('release marker receipt is not live-e2e provenance');
        }
      }
    }
  }

  // Landing page claims. The page states facts a visitor cannot check; the
  // ledger is what makes them trustworthy, so each is verified against the same
  // source of truth used above.
  if (pkg.ok && (!pkg.value || !pkg.value.version)) fail('package.json has no version');
  if (pkg.ok && pkg.value && pkg.value.version) {
    const pkgVersion = pkg.value.version;
    const pill = landing.match(/class="ver-pill">v(\d+\.\d+\.\d+)</);
    if (!pill) fail('landing version pill not found');
    else if (pill[1] !== pkgVersion) fail(`landing version pill v${pill[1]} != package ${pkgVersion}`);
    const eyebrow = landing.match(/v(\d+\.\d+\.\d+) · verified against Freebuff (\d+\.\d+\.\d+)/);
    if (!eyebrow) fail('landing eyebrow version/payload not found');
    else {
      if (eyebrow[1] !== pkgVersion) fail(`landing eyebrow version v${eyebrow[1]} != package ${pkgVersion}`);
      if (latestLive && eyebrow[2] !== latestLive.payloadVersion) {
        fail(`landing payload version ${eyebrow[2]} != live receipt ${latestLive.payloadVersion}`);
      }
    }
  }
  const heroTests = landing.match(/<strong>(\d+) tests<\/strong>/);
  if (!heroTests) fail('landing hero test count not found');
  else if (parseInt(heroTests[1], 10) !== testCount) {
    fail(`landing hero test count ${heroTests[1]} != actual ${testCount}`);
  }
  let corpusAdCount = 0;
  let corpusParsed = true;
  try {
    const entries = fs.readFileSync(path.join(root, 'corpus', 'golden.jsonl'), 'utf8')
      .trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    corpusAdCount = entries.filter((e) => e.label === 'ad').length;
  } catch { corpusParsed = false; }
  if (!corpusParsed) fail('corpus/golden.jsonl is not valid JSONL');
  const heroRoutes = landing.match(/<strong>(\d+)\/(\d+)<\/strong> ad routes blocked/);
  if (!heroRoutes) fail('landing ad-route claim not found');
  else if (parseInt(heroRoutes[1], 10) !== corpusAdCount || parseInt(heroRoutes[2], 10) !== corpusAdCount) {
    fail(`landing ad-route claim ${heroRoutes[1]}/${heroRoutes[2]} != corpus ${corpusAdCount}/${corpusAdCount}`);
  }
  // Coverage: the page prints a percentage, so the run must produce one. Both
  // forms are required; a reformat that drops one must fail rather than skip.
  const landingCovText = landing.match(/coverage (\d+(?:\.\d+)?)% lines/);
  const landingCovObj = landing.match(/coverage:\{lines:(\d+(?:\.\d+)?),branches:(\d+(?:\.\d+)?)\}/);
  if (!landingCovText) fail('landing coverage text not found');
  if (!landingCovObj) fail('landing coverage object not found');
  if (landingCovText && landingCovObj) {
    const actualLines = clean.match(/Lines\s*:\s*([\d.]+)%/);
    const actualBranches = clean.match(/Branches\s*:\s*([\d.]+)%/);
    if (!actualLines || !actualBranches) {
      fail('landing states a coverage figure but the test run produced no coverage report');
    } else {
      const linesPct = Math.round(parseFloat(actualLines[1]) * 10) / 10;
      const branchesPct = Math.round(parseFloat(actualBranches[1]) * 10) / 10;
      if (parseFloat(landingCovText[1]) !== linesPct) {
        fail(`landing coverage lines ${landingCovText[1]} != actual ${linesPct}`);
      }
      if (parseFloat(landingCovObj[1]) !== linesPct) fail(`landing coverage.lines ${landingCovObj[1]} != actual ${linesPct}`);
      if (parseFloat(landingCovObj[2]) !== branchesPct) fail(`landing coverage.branches ${landingCovObj[2]} != actual ${branchesPct}`);
    }
  }

  return { ok: findings.length === 0, findings, warnings };
}
