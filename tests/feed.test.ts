import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { signManifest, verifyManifest } from '../src/feed.js';

describe('feed manifest', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' });

  it('verifies a signed manifest', () => {
    const base = { version: 1, entries: [], rollbackTo: null };
    const sig = signManifest(base, privPem);
    expect(verifyManifest({ ...base, sig }, pubPem)).toBe(true);
  });

  it('rejects a tampered manifest', () => {
    const base = { version: 1, entries: [], rollbackTo: null };
    const sig = signManifest(base, privPem);
    const tampered = { ...base, version: 2, sig };
    expect(verifyManifest(tampered, pubPem)).toBe(false);
  });

  it('rejects the wrong key', () => {
    const base = { version: 1, entries: [], rollbackTo: null };
    const sig = signManifest(base, privPem);
    const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
    expect(verifyManifest({ ...base, sig }, other)).toBe(false);
  });
});

describe('feed sync', () => {
  beforeAll(() => {
    const dist = path.join(process.cwd(), 'dist', 'feed.js');
    if (!fs.existsSync(dist)) execSync('npm run build', { cwd: process.cwd(), stdio: 'inherit' });
  });
  it('materializes signed rules', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-feed-'));
    const manifestPath = path.join(tmp, 'm.json');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
    const base = { version: 1, entries: [{ healHash: 'h1', rules: { addEndpoints: ['/api/monetize'] } }], rollbackTo: null };
    const signed = { ...base, sig: signManifest(base, privPem) };
    fs.writeFileSync(manifestPath, JSON.stringify(signed));
    const cfg = path.join(tmp, 'cfg');
    const r = execSync(
      `node ${path.join(process.cwd(), 'scripts', 'feed-sync.mjs')} --manifest ${JSON.stringify(manifestPath)} --config-dir ${JSON.stringify(cfg)}`,
      { env: { ...process.env, FEED_PUBLIC_KEY: pubPem }, encoding: 'utf8' },
    );
    expect(r).toContain('applied');
    const rules = JSON.parse(fs.readFileSync(path.join(cfg, 'feed-rules.json'), 'utf8')) as { addEndpoints: string[] };
    expect(rules.addEndpoints).toContain('/api/monetize');
  });
});
