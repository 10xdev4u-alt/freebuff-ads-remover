import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { applyFeed } from '../scripts/feed-apply.mjs';

const repo = path.resolve(__dirname, '..');
const manifestPath = path.join(repo, 'feed', 'manifest.json');
const publicKey = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAXPPjDp264OD7EOmZY7//cV2rXyP1rNbWnJvHu2I34EI=',
  '-----END PUBLIC KEY-----',
].join('\n');

describe('applyFeed', () => {
  beforeAll(() => {
    if (!fs.existsSync(path.join(repo, 'dist', 'feed.js'))) {
      execSync('npm run build', { cwd: repo, stdio: 'inherit' });
    }
  });

  it('materializes the signed feed and reports the delivered rules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-feed-'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      version: number;
      entries: { healHash: string; rules: { addEndpoints?: string[] } }[];
    };
    const healHash = manifest.entries.map((e) => e.healHash).join(',');

    const res = applyFeed({ manifest: manifestPath, configDir: dir, publicKey });

    expect(res.receipt.version).toBe(manifest.version);
    expect(res.receipt.healHash).toBe(healHash);
    expect(res.rules.source).toBe(`feed:${healHash}`);
    expect(res.extraEndpoints).toEqual(manifest.entries.flatMap((e) => e.rules.addEndpoints ?? []));
    expect(fs.existsSync(path.join(dir, 'feed-rules.json'))).toBe(true);
  });

  it('refuses a manifest signed by another key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-feed-'));
    const otherKey = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });

    expect(() => applyFeed({ manifest: manifestPath, configDir: dir, publicKey: otherKey })).toThrow(/feed-sync exited 1/);
    expect(fs.existsSync(path.join(dir, 'delivery-receipt.json'))).toBe(false);
  });
});
