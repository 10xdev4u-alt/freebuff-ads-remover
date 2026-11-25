import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { evaluateReleaseCut } from '../scripts/release-gate.mjs';

const sha = (s: string) => 'sha256:' + crypto.createHash('sha256').update(s).digest('hex');
const DAY = 24 * 60 * 60 * 1000;

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-'));
  const write = (rel: string, content: string) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  const artifactText = JSON.stringify({ addEndpoints: ['/api/ad/x'], addSelectors: {}, addHosts: [] }, null, 2);
  const corpus = '{"path":"/api/ad/x","surface":"sponsorBreak"}\n';
  const artifactHash = sha(artifactText);
  const corpusHash = sha(corpus);
  const now = Date.now();
  const receipt = {
    at: new Date(now).toISOString(),
    payloadVersion: '0.0.205',
    corpusHash,
    probes: 7,
    pass: true,
    provenance: 'live-e2e',
    artifactHash,
    gate: { pass: true },
  };
  const marker = {
    version: '1.27.0',
    payloadVersion: '0.0.204',
    artifactHash: 'sha256:' + 'a'.repeat(64),
    receipt: 'receipts/live-0.0.204.json',
    at: new Date(now - 30 * DAY).toISOString(),
  };
  write('config/generated-rules.json', artifactText);
  write('corpus/golden.jsonl', corpus);
  write('receipts/live-0.0.205.json', JSON.stringify(receipt, null, 2));
  write('release/last-cut.json', JSON.stringify(marker, null, 2));
  write('package.json', JSON.stringify({ version: '1.27.0' }));
  return { root, artifactText, artifactHash, corpusHash, receipt, marker, now };
}

const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });
function fixture() { const f = makeFixture(); roots.push(f.root); return f; }
function rewrite(f: ReturnType<typeof fixture>, rel: string, value: unknown) {
  fs.writeFileSync(path.join(f.root, rel), JSON.stringify(value, null, 2));
}

describe('evaluateReleaseCut', () => {
  it('cuts a minor bump when the payload version changed', () => {
    const f = fixture();
    const r = evaluateReleaseCut(f.root, f.now);
    expect(r.status).toBe('cut');
    expect(r.bump).toBe('minor');
    expect(r.version).toBe('1.28.0');
    expect(r.payloadVersion).toBe('0.0.205');
  });

  it('cuts a patch bump when only the healed artifact changed', () => {
    const f = fixture();
    rewrite(f, 'release/last-cut.json', { ...f.marker, payloadVersion: '0.0.205' });
    const r = evaluateReleaseCut(f.root, f.now);
    expect(r.status).toBe('cut');
    expect(r.bump).toBe('patch');
    expect(r.version).toBe('1.27.1');
  });

  it('does not cut again for a timestamp-only receipt refresh', () => {
    const f = fixture();
    rewrite(f, 'release/last-cut.json', { ...f.marker, payloadVersion: '0.0.205', artifactHash: f.artifactHash });
    rewrite(f, 'receipts/live-0.0.205.json', { ...f.receipt, at: new Date(f.now - 1000).toISOString() });
    const r = evaluateReleaseCut(f.root, f.now);
    expect(r.status).toBe('none');
    expect(r.reason).toContain('match');
  });

  it('rejects a stale receipt instead of cutting from it', () => {
    const f = fixture();
    rewrite(f, 'receipts/live-0.0.205.json', { ...f.receipt, at: new Date(f.now - 8 * DAY).toISOString() });
    const r = evaluateReleaseCut(f.root, f.now);
    expect(r.status).toBe('invalid');
    expect(r.error).toContain('stale');
  });

  it('rejects a failing receipt', () => {
    const f = fixture();
    rewrite(f, 'receipts/live-0.0.205.json', { ...f.receipt, pass: false });
    expect(evaluateReleaseCut(f.root, f.now).status).toBe('invalid');
  });

  it('rejects a receipt without live-e2e provenance or probes', () => {
    const f = fixture();
    rewrite(f, 'receipts/live-0.0.205.json', { ...f.receipt, provenance: 'unit-test' });
    expect(evaluateReleaseCut(f.root, f.now).status).toBe('invalid');
    const g = fixture();
    rewrite(g, 'receipts/live-0.0.205.json', { ...g.receipt, probes: 0 });
    expect(evaluateReleaseCut(g.root, g.now).status).toBe('invalid');
  });

  it('rejects an artifact or corpus hash mismatch', () => {
    const f = fixture();
    rewrite(f, 'receipts/live-0.0.205.json', { ...f.receipt, artifactHash: 'sha256:' + 'b'.repeat(64) });
    expect(evaluateReleaseCut(f.root, f.now).status).toBe('invalid');
    const g = fixture();
    rewrite(g, 'receipts/live-0.0.205.json', { ...g.receipt, corpusHash: 'sha256:' + 'c'.repeat(64) });
    expect(evaluateReleaseCut(g.root, g.now).status).toBe('invalid');
  });

  it('rejects a payload version older than the last cut', () => {
    const f = fixture();
    rewrite(f, 'release/last-cut.json', { ...f.marker, payloadVersion: '0.0.206' });
    const r = evaluateReleaseCut(f.root, f.now);
    expect(r.status).toBe('invalid');
    expect(r.error).toMatch(/older|regress/i);
  });

  it('fails closed on an ambiguous newest-receipt tie', () => {
    const f = fixture();
    const twin = { ...f.receipt, artifactHash: 'sha256:' + 'd'.repeat(64) };
    fs.writeFileSync(path.join(f.root, 'receipts/live-0.0.206.json'), JSON.stringify(twin, null, 2));
    const r = evaluateReleaseCut(f.root, f.now);
    expect(r.status).toBe('invalid');
    expect(r.error).toContain('ambiguous');
  });

  it('fails closed on a missing or corrupt marker', () => {
    const f = fixture();
    fs.rmSync(path.join(f.root, 'release/last-cut.json'));
    expect(evaluateReleaseCut(f.root, f.now).status).toBe('invalid');
    const g = fixture();
    fs.writeFileSync(path.join(g.root, 'release/last-cut.json'), '{not json');
    expect(evaluateReleaseCut(g.root, g.now).status).toBe('invalid');
  });

  it('fails closed with no live receipt or an unparseable one', () => {
    const f = fixture();
    fs.rmSync(path.join(f.root, 'receipts/live-0.0.205.json'));
    expect(evaluateReleaseCut(f.root, f.now).status).toBe('invalid');
    const g = fixture();
    fs.writeFileSync(path.join(g.root, 'receipts/live-0.0.205.json'), 'oops');
    expect(evaluateReleaseCut(g.root, g.now).status).toBe('invalid');
  });

  it('rejects an invalid package version or non-semver payload', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'package.json'), JSON.stringify({ version: '1.27' }));
    expect(evaluateReleaseCut(f.root, f.now).status).toBe('invalid');
    const g = fixture();
    rewrite(g, 'receipts/live-0.0.205.json', { ...g.receipt, payloadVersion: 'latest' });
    expect(evaluateReleaseCut(g.root, g.now).status).toBe('invalid');
  });
});
