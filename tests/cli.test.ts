import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runCli } from '../src/cli.js';
import { signManifest } from '../src/feed.js';

describe('cli', () => {
  it('inspect returns 0', () => { expect(runCli(['inspect'])).toBe(0); });
  it('doctor returns 0', () => { expect(runCli(['doctor'])).toBe(0); });
  it('help returns 0', () => { expect(runCli(['help'])).toBe(0); });
  it('unknown returns 0 (help)', () => { expect(runCli([])).toBe(0); });
});

describe('cli extra', () => {
  it('capture status', () => { expect(runCli(['capture'])).toBe(0); });
  it('replay missing file returns 2', () => { expect(runCli(['replay', '--capture', '/nope.jsonl'])).toBe(2); });
  it('discover missing file returns 2', () => { expect(runCli(['discover', '--capture', '/nope.jsonl'])).toBe(2); });
  it('corpus verify', () => { expect(runCli(['corpus'])).toBe(0); });
  it('gate', () => { expect(runCli(['gate'])).toBe(0); });
});

describe('feed kill switch', () => {
  function setup(killSwitch: boolean) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-feed-kill-'));
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const pub = publicKey.export({ type: 'spki', format: 'pem' });
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ feed: { killSwitch } }));
    const manifestPath = path.join(dir, 'manifest.json');
    const manifest = {
      version: 1,
      entries: [{ healHash: 'h', rules: { addEndpoints: ['/api/ad/killswitch-probe'] } }],
    };
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, sig: signManifest(manifest, priv) }));
    return { dir, pub, manifestPath };
  }

  const oldKey = process.env.FEED_PUBLIC_KEY;
  const oldDir = process.env.FREEBUFF_CONFIG_DIR;

  function feedSync(dir: string, pub: string, manifestPath: string): number {
    process.env.FEED_PUBLIC_KEY = pub;
    process.env.FREEBUFF_CONFIG_DIR = dir;
    return runCli(['feed-sync', '--url', manifestPath, '--dir', dir]);
  }

  function restoreEnv(): void {
    if (oldKey === undefined) delete process.env.FEED_PUBLIC_KEY;
    else process.env.FEED_PUBLIC_KEY = oldKey;
    if (oldDir === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
    else process.env.FREEBUFF_CONFIG_DIR = oldDir;
  }

  it('honours feed.killSwitch from config', () => {
    const { dir, pub, manifestPath } = setup(true);
    try {
      expect(feedSync(dir, pub, manifestPath)).toBe(0);
      expect(fs.existsSync(path.join(dir, 'feed-rules.json'))).toBe(false);
    } finally {
      restoreEnv();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still applies a signed manifest when the kill switch is off', () => {
    const { dir, pub, manifestPath } = setup(false);
    try {
      expect(feedSync(dir, pub, manifestPath)).toBe(0);
      const rules = JSON.parse(fs.readFileSync(path.join(dir, 'feed-rules.json'), 'utf8')) as { addEndpoints: string[] };
      expect(rules.addEndpoints).toContain('/api/ad/killswitch-probe');
    } finally {
      restoreEnv();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
