import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
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

  it('accepts a previous key during rollover', () => {
    const current = crypto.generateKeyPairSync('ed25519');
    const previous = crypto.generateKeyPairSync('ed25519');
    const currentPub = current.publicKey.export({ type: 'spki', format: 'pem' });
    const previousPub = previous.publicKey.export({ type: 'spki', format: 'pem' });
    const previousPriv = previous.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const base = { version: 1, entries: [], rollbackTo: null };
    const sig = signManifest(base, previousPriv);
    expect(verifyManifest({ ...base, sig }, currentPub, previousPub)).toBe(true);
    expect(verifyManifest({ ...base, sig }, currentPub)).toBe(false);
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
    expect(fs.existsSync(path.join(cfg, 'feed-rules.json.tmp'))).toBe(false);
    const rules = JSON.parse(fs.readFileSync(path.join(cfg, 'feed-rules.json'), 'utf8')) as { addEndpoints: string[] };
    expect(rules.addEndpoints).toContain('/api/monetize');
  });

  it('rejects a replayed signed rollback manifest below the version high-water mark', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-feed-replay-'));
    const cfg = path.join(tmp, 'cfg');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
    const run = (name: string, base: Parameters<typeof signManifest>[0]) => {
      const manifestPath = path.join(tmp, `${name}.json`);
      fs.writeFileSync(manifestPath, JSON.stringify({ ...base, sig: signManifest(base, privPem) }));
      return spawnSync(
        process.execPath,
        [path.join(process.cwd(), 'scripts', 'feed-sync.mjs'), '--manifest', manifestPath, '--config-dir', cfg],
        { env: { ...process.env, FEED_PUBLIC_KEY: pubPem }, encoding: 'utf8' },
      );
    };

    const fresh = run('fresh', {
      version: 5, rollbackTo: null,
      entries: [{ healHash: 'current', rules: { addEndpoints: ['/api/current'] } }],
    });
    expect(fresh.stdout).toContain('applied');

    const replay = run('replay', { version: 2, rollbackTo: '1', entries: [] });
    expect(replay.status).toBe(0);
    expect(replay.stdout).toContain('up-to-date');
    expect(replay.stdout).not.toContain('rolled-back');

    const rules = JSON.parse(fs.readFileSync(path.join(cfg, 'feed-rules.json'), 'utf8')) as { addEndpoints: string[] };
    expect(rules.addEndpoints).toContain('/api/current');
    const state = JSON.parse(fs.readFileSync(path.join(cfg, 'feed-state.json'), 'utf8')) as { version: number };
    expect(state.version).toBe(5);
  });

  it('still applies a fresh signed rollback manifest', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-feed-rollback-'));
    const cfg = path.join(tmp, 'cfg');
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
    const run = (name: string, base: Parameters<typeof signManifest>[0]) => {
      const manifestPath = path.join(tmp, `${name}.json`);
      fs.writeFileSync(manifestPath, JSON.stringify({ ...base, sig: signManifest(base, privPem) }));
      return spawnSync(
        process.execPath,
        [path.join(process.cwd(), 'scripts', 'feed-sync.mjs'), '--manifest', manifestPath, '--config-dir', cfg],
        { env: { ...process.env, FEED_PUBLIC_KEY: pubPem }, encoding: 'utf8' },
      );
    };

    expect(run('fresh', {
      version: 5, rollbackTo: null,
      entries: [{ healHash: 'current', rules: { addEndpoints: ['/api/current'] } }],
    }).stdout).toContain('applied');
    const rollback = run('rollback', { version: 6, rollbackTo: '4', entries: [] });
    expect(rollback.stdout).toContain('rolled-back');
    const state = JSON.parse(fs.readFileSync(path.join(cfg, 'feed-state.json'), 'utf8')) as { version: number };
    expect(state.version).toBe(6);
  });

  it('keeps the previous rules when the manifest signature is invalid', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-feed-'));
    const manifestPath = path.join(tmp, 'm.json');
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const base = { version: 1, entries: [{ healHash: 'h1', rules: { addEndpoints: ['/api/monetize'] } }], rollbackTo: null };
    const signed = { ...base, sig: signManifest(base, privPem) };
    fs.writeFileSync(manifestPath, JSON.stringify(signed));
    const cfg = path.join(tmp, 'cfg');
    fs.mkdirSync(cfg, { recursive: true });
    const rulesPath = path.join(cfg, 'feed-rules.json');
    fs.writeFileSync(rulesPath, JSON.stringify({ addEndpoints: ['/api/old'] }));

    const otherPub = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
    const r = spawnSync(
      process.execPath,
      [path.join(process.cwd(), 'scripts', 'feed-sync.mjs'), '--manifest', manifestPath, '--config-dir', cfg],
      { env: { ...process.env, FEED_PUBLIC_KEY: otherPub }, encoding: 'utf8' },
    );

    expect(r.status).not.toBe(0);
    expect(JSON.parse(fs.readFileSync(rulesPath, 'utf8'))).toEqual({ addEndpoints: ['/api/old'] });
    expect(fs.existsSync(`${rulesPath}.tmp`)).toBe(false);
  });
});
