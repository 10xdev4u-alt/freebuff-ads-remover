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
  write('README.md', 'npm test # vitest, 1 tests\n![version-1.2.3-blue](x)\n');
  write('index.html', `✓ 1 tests passed · 1 files hash:'${artifactHash}'`);
  write('tests/a.test.ts', '');
  write('corpus/golden.jsonl', corpus);
  write('corpus/manifest.json', JSON.stringify({ version: 1, freebuffVersion: '0.0.204', sha256: corpusHash.replace('sha256:', '') }));
  write('config/generated-rules.json', artifactText);
  write('config/endpoint-baseline.json', JSON.stringify({ version: 1, generatedAt: now, payloadVersion: '0.0.204', routes: ['/api/chat'] }));
  write('receipts/live-0.0.204.json', JSON.stringify({ at: now, payloadVersion: '0.0.204', provenance: 'live-e2e', pass: true, probes: 5, artifactHash }));
  write('feed/manifest.json', JSON.stringify({ version: 1, generatedAt: now, entries: [{ healHash: artifactHash, rules: artifact }], rollbackTo: null }));
  write('live-proof/index.html', '<html></html>');
  write('package.json', JSON.stringify({ version: '1.2.3' }));
  write('CHANGELOG.md', '## [1.2.3] 2026-01-01\n');
  return { root, artifactHash, artifactText, corpus, corpusHash, now };
}

const deps = {
  runVitest: () => ({ code: 0, out: 'Tests 1 passed' }),
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
});
