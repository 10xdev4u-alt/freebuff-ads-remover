import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { assertTagReady } from '../scripts/release-gate.mjs';

const sha = (s: string) => 'sha256:' + crypto.createHash('sha256').update(s).digest('hex');
const DAY = 24 * 60 * 60 * 1000;

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-tag-'));
  const write = (rel: string, content: string) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  const now = Date.now();
  const artifactHash = sha('artifact');
  const receipt = {
    at: new Date(now).toISOString(),
    payloadVersion: '0.0.205',
    provenance: 'live-e2e',
    pass: true,
    probes: 9,
    artifactHash,
  };
  write('package.json', JSON.stringify({ version: '1.27.0' }, null, 2));
  write('receipts/live-0.0.205.json', JSON.stringify(receipt, null, 2));
  write(
    'release/last-cut.json',
    JSON.stringify(
      {
        version: '1.27.0',
        payloadVersion: '0.0.205',
        artifactHash,
        receipt: 'receipts/live-0.0.205.json',
        at: receipt.at,
      },
      null,
      2,
    ),
  );
  return { root, artifactHash, receipt, now };
}

const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });
function fixture() { const f = makeFixture(); roots.push(f.root); return f; }
function rewrite(f: ReturnType<typeof fixture>, rel: string, value: unknown) {
  fs.writeFileSync(path.join(f.root, rel), JSON.stringify(value, null, 2));
}

describe('assertTagReady', () => {
  it('accepts a marker that matches package.json and a fresh passing receipt', () => {
    const f = fixture();
    expect(assertTagReady(f.root, f.now)).toEqual({ version: '1.27.0' });
  });

  it('rejects a marker that disagrees with package.json', () => {
    const f = fixture();
    rewrite(f, 'package.json', { version: '1.28.0' });
    expect(() => assertTagReady(f.root, f.now)).toThrow(/package\.json/);
  });

  it('rejects a marker pointing at a missing receipt', () => {
    const f = fixture();
    fs.rmSync(path.join(f.root, 'receipts', 'live-0.0.205.json'));
    expect(() => assertTagReady(f.root, f.now)).toThrow(/missing or unreadable/);
  });

  it('rejects a receipt whose pair does not match the marker', () => {
    const f = fixture();
    rewrite(f, 'receipts/live-0.0.205.json', { ...f.receipt, artifactHash: 'sha256:' + 'b'.repeat(64) });
    expect(() => assertTagReady(f.root, f.now)).toThrow(/artifactHash/);
    const g = fixture();
    rewrite(g, 'receipts/live-0.0.205.json', { ...g.receipt, payloadVersion: '0.0.204' });
    expect(() => assertTagReady(g.root, g.now)).toThrow(/payloadVersion/);
  });

  it('rejects a failing or stale receipt', () => {
    const f = fixture();
    rewrite(f, 'receipts/live-0.0.205.json', { ...f.receipt, pass: false });
    expect(() => assertTagReady(f.root, f.now)).toThrow(/did not pass/);
    const g = fixture();
    rewrite(g, 'receipts/live-0.0.205.json', { ...g.receipt, at: new Date(g.now - 8 * DAY).toISOString() });
    expect(() => assertTagReady(g.root, g.now)).toThrow(/stale/);
  });

  it('rejects a receipt path that escapes the repository', () => {
    const f = fixture();
    rewrite(f, 'release/last-cut.json', {
      version: '1.27.0',
      payloadVersion: '0.0.205',
      artifactHash: f.artifactHash,
      receipt: '../outside.json',
    });
    expect(() => assertTagReady(f.root, f.now)).toThrow(/escapes/);
  });

  it('fails closed on a corrupt marker', () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'release', 'last-cut.json'), '{oops');
    expect(() => assertTagReady(f.root, f.now)).toThrow(/corrupt/);
  });
});
