import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// The drill refreshes the shared corpus from its payload, so this file backs the
// corpus up and restores it: a host-only drill must not inherit ad routes left
// behind by another fixture's drill.
const repo = path.resolve(__dirname, '..');
const corpusFiles = ['corpus/golden.jsonl', 'corpus/manifest.json'];
const corpusBackup = new Map<string, string>();

describe('loop drill heals a host', () => {
  beforeAll(() => {
    for (const f of corpusFiles) corpusBackup.set(f, fs.readFileSync(path.join(repo, f), 'utf8'));
    if (!fs.existsSync('/tmp/feed-private.pem')) {
      const { privateKey } = crypto.generateKeyPairSync('ed25519');
      fs.writeFileSync('/tmp/feed-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
    }
  });
  afterAll(() => {
    for (const [f, v] of corpusBackup) fs.writeFileSync(path.join(repo, f), v);
    corpusBackup.clear();
  });

  it('counts a host-only heal as a real delta', () => {
    const env = { ...process.env, FEED_SIGNING_PRIVATE_KEY: fs.readFileSync('/tmp/feed-private.pem', 'utf8') };
    const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drill-host-receipt-'));
    const receiptOut = path.join(receiptDir, 'drill-receipt.json');
    const out = execSync(
      `node scripts/loop-drill.mjs --json --payload ${JSON.stringify(path.join(repo, 'tests', 'fixtures', 'payload-absolute', 'resources'))} --receipt-out "${receiptOut}"`,
      { cwd: repo, env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const result = JSON.parse(out.trim().split('\n').pop()!) as { status: string; delta: number; work: string };
    expect(result.status).toBe('pass');
    expect(result.delta).toBe(1);
    const artifact = JSON.parse(fs.readFileSync(path.join(result.work, 'generated-rules.json'), 'utf8')) as { addHosts?: string[] };
    expect(artifact.addHosts).toEqual(['ads.example.com']);
  });
});
