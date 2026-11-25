import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const repo = path.resolve(__dirname, '..');
const corpusFiles = ['corpus/golden.jsonl','corpus/manifest.json'];
const corpusBackup = new Map<string,string>();

function backupCorpus() { for (const f of corpusFiles) corpusBackup.set(f, fs.readFileSync(path.join(repo, f), 'utf8')); }
function restoreCorpus() { for (const [f, v] of corpusBackup) fs.writeFileSync(path.join(repo, f), v); }

describe('loop drill', () => {
  beforeAll(backupCorpus);
  afterAll(restoreCorpus);
  it('runs end to end against the payload-gap fixture', { timeout: 15000 }, () => {
    if (!fs.existsSync('/tmp/feed-private.pem')) {
      const { privateKey } = crypto.generateKeyPairSync('ed25519');
      fs.writeFileSync('/tmp/feed-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
    }
    const env = { ...process.env, FEED_SIGNING_PRIVATE_KEY: fs.readFileSync('/tmp/feed-private.pem', 'utf8') };
    const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-receipt-'));
    const receiptOut = path.join(receiptDir, 'drill-receipt.json');
    const before = fs.readdirSync(path.join(repo, 'receipts')).filter((f) => f.startsWith('drill-'));
    let out = '';
    let err: unknown = null;
    try {
      out = execSync(`node scripts/loop-drill.mjs --json --receipt-out "${receiptOut}"`, { cwd: repo, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { err = e; }
    // The drill must prove a real gap and leave the repo's receipts untouched.
    const after = fs.readdirSync(path.join(repo, 'receipts')).filter((f) => f.startsWith('drill-'));
    expect(after).toEqual(before);
    if (err) throw err instanceof Error ? err : new Error('loop drill failed');

    const result = JSON.parse(out.trim().split('\n').pop()!) as { status: string; delta: number; work: string };
    expect(result.status).toBe('pass');
    expect(result.delta).toBeGreaterThan(0);
    const drillReceipt = JSON.parse(fs.readFileSync(receiptOut, 'utf8')) as { provenance: string; delta: number; healHash: string };
    expect(drillReceipt.provenance).toBe('drill');
    expect(drillReceipt.delta).toBe(result.delta);
    const healReceipt = JSON.parse(fs.readFileSync(path.join(result.work, 'receipt.json'), 'utf8')) as { artifactHash: string };
    expect(drillReceipt.healHash).toBe(healReceipt.artifactHash);
  });

  it('writes the drill receipt under the work dir by default', { timeout: 15000 }, () => {
    if (!fs.existsSync('/tmp/feed-private.pem')) {
      const { privateKey } = crypto.generateKeyPairSync('ed25519');
      fs.writeFileSync('/tmp/feed-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
    }
    const env = { ...process.env, FEED_SIGNING_PRIVATE_KEY: fs.readFileSync('/tmp/feed-private.pem', 'utf8') };
    const before = fs.readdirSync(path.join(repo, 'receipts')).filter((f) => f.startsWith('drill-'));
    const out = execSync('node scripts/loop-drill.mjs --json', { cwd: repo, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const after = fs.readdirSync(path.join(repo, 'receipts')).filter((f) => f.startsWith('drill-'));
    expect(after).toEqual(before);

    const result = JSON.parse(out.trim().split('\n').pop()!) as { status: string; work: string; receipt: string };
    expect(result.status).toBe('pass');
    expect(result.receipt.startsWith(result.work + path.sep)).toBe(true);
    expect(fs.existsSync(result.receipt)).toBe(true);
  });

  it('fails when the fixture has no heal delta', { timeout: 15000 }, () => {    const fixtureRoot = path.join(repo, 'tests', 'fixtures', 'payload-gap');
    const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'expected-rules.json'), 'utf8')) as { addEndpoints: string[] };
    const route = expected.addEndpoints[0];
    if (!route) throw new Error('payload-gap fixture has no expected route');
    const payload = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-healed-'));
    try {
      fs.cpSync(path.join(fixtureRoot, 'resources'), payload, { recursive: true });
      const mainJs = path.join(payload, 'orchestrator', 'main.js');
      fs.writeFileSync(mainJs, fs.readFileSync(mainJs, 'utf8').replace(`'${route}', `, ''));
      const r = spawnSync('node', ['scripts/loop-drill.mjs', '--json', '--payload', payload], { cwd: repo, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('empty heal delta');
    } finally {
      fs.rmSync(payload, { recursive: true, force: true });
      restoreCorpus();
    }
  });
});
