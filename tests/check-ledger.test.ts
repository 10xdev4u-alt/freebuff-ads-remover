import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { checkLedger } from '../scripts/ledger-check.mjs';

const sha = (s: string) => 'sha256:' + crypto.createHash('sha256').update(s).digest('hex');

// A self-contained fixture repo. Every claim the ledger checks is present and
// true, so each negative test can break exactly one claim.
function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-check-'));
  const write = (rel: string, content: string) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  const artifact = { addEndpoints: [], addSelectors: {}, source: 'ci-healed:unknown' };
  const artifactText = JSON.stringify(artifact, null, 2);
  const artifactHash = sha(artifactText);
  const corpus = '{"path":"/api/ad/x","label":"ad"}\n';
  const corpusHash = sha(corpus);
  const now = new Date().toISOString();
  const liveReceipt = { at: now, payloadVersion: '0.0.204', provenance: 'live-e2e', pass: true, probes: 5, artifactHash, corpusHash };
  write('README.md', 'npm test # vitest, 1 tests\n![version-1.2.3-blue](x)\n');
  write('index.html', [
    '<span class="ver-pill">v1.2.3</span>',
    '<span class="eyebrow">v1.2.3 · verified against Freebuff 0.0.204</span>',
    '<strong>1 tests</strong>',
    '<strong>1/1</strong> ad routes blocked',
    `✓ 1 tests passed · 1 files hash:'${artifactHash}'`,
    '<span>coverage 50% lines</span>',
    'coverage:{lines:50,branches:40}',
  ].join('\n'));
  write('tests/a.test.ts', '');
  write('corpus/golden.jsonl', corpus);
  write('corpus/manifest.json', JSON.stringify({ version: 1, freebuffVersion: '0.0.204', sha256: corpusHash.replace('sha256:', '') }));
  write('config/generated-rules.json', artifactText);
  write('config/endpoint-baseline.json', JSON.stringify({ version: 1, generatedAt: now, payloadVersion: '0.0.204', routes: ['/api/chat'] }));
  write('receipts/live-0.0.204.json', JSON.stringify(liveReceipt));
  write('feed/manifest.json', JSON.stringify({ version: 1, generatedAt: now, entries: [{ healHash: artifactHash, rules: artifact }], rollbackTo: null }));
  write('live-proof/index.html', `<pre>${JSON.stringify(liveReceipt, null, 2)}</pre>`);
  write('package.json', JSON.stringify({ version: '1.2.3' }));
  write('release/last-cut.json', JSON.stringify({
    version: '1.2.3',
    payloadVersion: '0.0.204',
    artifactHash,
    receipt: 'receipts/live-0.0.204.json',
    at: now,
  }));
  write('CHANGELOG.md', '## [1.2.3] 2026-01-01\n');
  return { root, artifactHash, artifactText, corpus, corpusHash, now, liveReceipt };
}

const deps = {
  runVitest: () => ({ code: 0, out: 'Tests 1 passed\nLines : 50.00%\nBranches : 40.00%' }),
  verifyManifest: () => true,
};

const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });

function fixture() { const f = makeFixture(); roots.push(f.root); return f; }

describe('ledger gate', () => {
  it('passes a self-consistent fixture', async () => {
    const f = fixture();
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('fails when the landing receipt hash is missing', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/hash:'sha256:[0-9a-f]+'/, ''));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing receipt hash not found');
  });

  it('fails when the landing receipt hash matches no receipt', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/sha256:[0-9a-f]+/, 'sha256:' + '0'.repeat(64)));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing receipt hash does not match any receipt');
  });

  it('fails when the live receipt records a failure', async () => {
    const f = fixture();
    const p = path.join(f.root, 'receipts', 'live-0.0.204.json');
    fs.writeFileSync(p, JSON.stringify({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as { pass: boolean }), pass: false }));
    const r = await checkLedger(f.root, deps);
    expect(r.ok).toBe(false);
    expect(r.findings).toContain('live receipt did not pass');
  });

  it('fails when no live receipt exists', async () => {
    const f = fixture();
    fs.rmSync(path.join(f.root, 'receipts', 'live-0.0.204.json'));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('no live-e2e receipt present (run e2e-headless --feed to generate)');
  });

  it('fails when the live receipt has no probes', async () => {
    const f = fixture();
    const p = path.join(f.root, 'receipts', 'live-0.0.204.json');
    const r0 = JSON.parse(fs.readFileSync(p, 'utf8')) as { probes?: number };
    delete r0.probes;
    fs.writeFileSync(p, JSON.stringify(r0));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('live receipt has no probes');
  });

  it('fails when the live receipt has the wrong provenance', async () => {
    const f = fixture();
    const p = path.join(f.root, 'receipts', 'live-0.0.204.json');
    fs.writeFileSync(p, JSON.stringify({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as { provenance: string }), provenance: 'manual' }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('live receipt missing provenance: live-e2e');
  });

  it('fails when the live receipt timestamp is missing or invalid', async () => {
    const f = fixture();
    const p = path.join(f.root, 'receipts', 'live-0.0.204.json');
    fs.writeFileSync(p, JSON.stringify({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as { at: string }), at: 'not-a-date' }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('live receipt has a missing or invalid timestamp');
  });

  it('fails when the live receipt artifactHash does not match the shipped artifact', async () => {
    const f = fixture();
    const p = path.join(f.root, 'receipts', 'live-0.0.204.json');
    fs.writeFileSync(p, JSON.stringify({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as { artifactHash: string }), artifactHash: 'sha256:deadbeef' }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('live receipt artifactHash does not match config/generated-rules.json');
  });

  it('fails when the feed healHash matches no receipt', async () => {
    const f = fixture();
    const p = path.join(f.root, 'feed', 'manifest.json');
    const m = JSON.parse(fs.readFileSync(p, 'utf8')) as { entries: { healHash: string }[] };
    if (m.entries[0]) m.entries[0].healHash = 'sha256:deadbeef';
    fs.writeFileSync(p, JSON.stringify(m));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('feed healHash does not match any committed receipt');
  });

  it('fails when the corpus manifest hash is stale', async () => {
    const f = fixture();
    fs.appendFileSync(path.join(f.root, 'corpus', 'golden.jsonl'), '{"path":"/api/ad/y","label":"ad"}\n');
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('corpus manifest hash mismatch');
  });

  it('fails when the README test count is wrong', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'README.md'), 'npm test # vitest, 2 tests\n![version-1.2.3-blue](x)\n');
    const r = await checkLedger(f.root, deps);
    expect(r.findings.join('\n')).toContain('README test count 2 != actual 1');
  });

  it('fails when vitest itself fails', async () => {
    const f = fixture();
    const r = await checkLedger(f.root, { ...deps, runVitest: () => ({ code: 1, out: 'Tests 1 failed' }) });
    expect(r.findings).toContain('vitest exited 1');
  });

  it('fails when the payload baseline disagrees with the corpus', async () => {
    const f = fixture();
    const p = path.join(f.root, 'config', 'endpoint-baseline.json');
    fs.writeFileSync(p, JSON.stringify({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as { payloadVersion: string }), payloadVersion: '0.0.203' }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings.join('\n')).toContain('baseline/corpus version mismatch');
  });

  it('fails when a heal receipt records a failed gate', async () => {
    const f = fixture();
    const artifact = { addEndpoints: ['/api/ad/new'], addSelectors: {}, source: 'ci-healed:0.0.204' };
    const artifactText = JSON.stringify(artifact, null, 2);
    fs.writeFileSync(path.join(f.root, 'config', 'generated-rules.json'), artifactText);
    const artifactHash = sha(artifactText);
    fs.writeFileSync(path.join(f.root, 'receipts', 'heal-0.0.204.json'), JSON.stringify({
      at: f.now, payloadVersion: '0.0.204', provenance: 'machine', artifactHash, corpusHash: f.corpusHash,
      gate: { pass: false, recall: 0.5, precision: 1 },
    }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('heal receipt gate not pass');
  });

  it('fails when the feed signature does not verify', async () => {
    const f = fixture();
    const r = await checkLedger(f.root, { ...deps, verifyManifest: () => false });
    expect(r.findings).toContain('feed manifest signature invalid');
  });

  it('fails when the landing version pill is stale', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('class="ver-pill">v1.2.3<', 'class="ver-pill">v9.9.9<'));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing version pill v9.9.9 != package 1.2.3');
  });

  it('fails when the landing hero test count is stale', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<strong>1 tests</strong>', '<strong>2 tests</strong>'));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing hero test count 2 != actual 1');
  });

  it('fails when the landing ad-route claim is stale', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<strong>1/1</strong> ad routes blocked', '<strong>2/2</strong> ad routes blocked'));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing ad-route claim 2/2 != corpus 1/1');
  });

  it('fails when the landing coverage figure is stale', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('coverage 50% lines', 'coverage 99% lines'));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing coverage lines 99 != actual 50');
  });

  it('fails when the landing coverage object is stale', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('coverage:{lines:50,branches:40}', 'coverage:{lines:50,branches:99}'));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing coverage.branches 99 != actual 40');
  });

  it('fails when the landing states coverage but the run reports none', async () => {
    const f = fixture();
    const r = await checkLedger(f.root, { ...deps, runVitest: () => ({ code: 0, out: 'Tests 1 passed' }) });
    expect(r.findings).toContain('landing states a coverage figure but the test run produced no coverage report');
  });

  it('fails when the landing payload version is stale', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('verified against Freebuff 0.0.204', 'verified against Freebuff 0.0.203'));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing payload version 0.0.203 != live receipt 0.0.204');
  });

  it('fails when the live-proof page embeds a receipt that was never committed', async () => {
    const f = fixture();
    const p = path.join(f.root, 'live-proof', 'index.html');
    const receipt = { ...f.liveReceipt, at: '2026-02-02T00:00:00.000Z' };
    fs.writeFileSync(p, `<pre>${JSON.stringify(receipt, null, 2)}</pre>`);
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('live-proof page does not match a committed passing live-e2e receipt');
  });

  it('warns when the live-proof page describes an older corpus', async () => {
    const f = fixture();
    const receipt = { ...f.liveReceipt, corpusHash: 'sha256:older', at: '2026-01-01T00:00:00.000Z' };
    fs.writeFileSync(path.join(f.root, 'receipts', 'live-0.0.203.json'), JSON.stringify(receipt));
    fs.writeFileSync(path.join(f.root, 'live-proof', 'index.html'), `<pre>${JSON.stringify(receipt, null, 2)}</pre>`);
    const r = await checkLedger(f.root, deps);
    expect(r.ok).toBe(true);
    expect(r.warnings).toContain('live-proof page describes an older corpus; the nightly publish refreshes it');
  });

  it('fails when the live-proof page copies a receipt id but lies about the result', async () => {
    const f = fixture();
    const p = path.join(f.root, 'live-proof', 'index.html');
    const receipt = { ...f.liveReceipt, pass: false, probes: 0 };
    fs.writeFileSync(p, `<pre>${JSON.stringify(receipt, null, 2)}</pre>`);
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('live-proof page does not match a committed passing live-e2e receipt');
  });

  it('fails when the landing coverage text is missing', async () => {
    const f = fixture();
    const p = path.join(f.root, 'index.html');
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<span>coverage 50% lines</span>', ''));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('landing coverage text not found');
  });

  it('fails when package.json has no version', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'package.json'), JSON.stringify({ name: 'x' }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('package.json has no version');
  });

  it('fails when the corpus is not valid JSONL', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'corpus', 'golden.jsonl'), '{"path":"/api/ad/x","label":"ad"}\nnot-json\n');
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('corpus/golden.jsonl is not valid JSONL');
  });

  it('fails when the release marker disagrees with package.json', async () => {
    const f = fixture();
    const p = path.join(f.root, 'release', 'last-cut.json');
    fs.writeFileSync(p, JSON.stringify({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as { version: string }), version: '9.9.9' }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('release marker version "9.9.9" != package 1.2.3');
  });

  it('fails when the release marker points at a missing receipt', async () => {
    const f = fixture();
    const p = path.join(f.root, 'release', 'last-cut.json');
    fs.writeFileSync(p, JSON.stringify({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as { receipt: string }), receipt: 'receipts/live-0.0.999.json' }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('release marker receipt receipts/live-0.0.999.json is missing or corrupt');
  });

  it('fails when the release marker pair does not match its receipt', async () => {
    const f = fixture();
    const p = path.join(f.root, 'release', 'last-cut.json');
    fs.writeFileSync(p, JSON.stringify({ ...(JSON.parse(fs.readFileSync(p, 'utf8')) as { payloadVersion: string }), payloadVersion: '0.0.203' }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('release marker payloadVersion "0.0.203" != receipt "0.0.204"');
  });

  it('fails when the release marker receipt is stale', async () => {
    const f = fixture();
    fs.writeFileSync(
      path.join(f.root, 'receipts', 'live-0.0.204.json'),
      JSON.stringify({ ...f.liveReceipt, at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() }),
    );
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('release marker receipt is stale (>7d)');
  });

  it('fails when the release marker pair does not match the shipped artifact', async () => {
    const f = fixture();
    const wrong = 'sha256:' + 'b'.repeat(64);
    fs.writeFileSync(path.join(f.root, 'release', 'last-cut.json'), JSON.stringify({
      version: '1.2.3', payloadVersion: '0.0.204', artifactHash: wrong,
      receipt: 'receipts/live-0.0.204.json', at: f.now,
    }));
    fs.writeFileSync(path.join(f.root, 'receipts', 'live-0.0.204.json'), JSON.stringify({ ...f.liveReceipt, artifactHash: wrong }));
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('release marker artifactHash does not match shipped artifact');
  });

  it('fails when the release marker does not point at the newest live receipt', async () => {
    const f = fixture();
    fs.writeFileSync(
      path.join(f.root, 'receipts', 'live-0.0.205.json'),
      JSON.stringify({ ...f.liveReceipt, at: new Date(Date.now() + 1000).toISOString() }),
    );
    const r = await checkLedger(f.root, deps);
    expect(r.findings).toContain('release marker does not point at the newest live receipt');
  });
});
