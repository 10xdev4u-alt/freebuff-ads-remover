import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { signManifest, verifyManifest } from '../src/feed.js';

describe('feed manifest', () => {
  it('verifies a signed manifest', () => {
    const base = { version: 1, entries: [], rollbackTo: null };
    const sig = signManifest(base, 'secret');
    expect(verifyManifest({ ...base, sig }, 'secret')).toBe(true);
  });

  it('rejects a tampered manifest', () => {
    const base = { version: 1, entries: [], rollbackTo: null };
    const sig = signManifest(base, 'secret');
    const tampered = { ...base, version: 2, sig };
    expect(verifyManifest(tampered, 'secret')).toBe(false);
  });

  it('rejects the wrong key', () => {
    const base = { version: 1, entries: [], rollbackTo: null };
    const sig = signManifest(base, 'secret');
    expect(verifyManifest({ ...base, sig }, 'other')).toBe(false);
  });
});

describe('feed sync', () => {
  it('materializes signed rules', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-feed-'));
    const manifestPath = path.join(tmp, 'm.json');
    const base = { version: 1, entries: [{ healHash: 'h1', rules: { addEndpoints: ['/api/monetize'] } }], rollbackTo: null };
    const signed = { ...base, sig: signManifest(base, 'secret') };
    fs.writeFileSync(manifestPath, JSON.stringify(signed));
    const cfg = path.join(tmp, 'cfg');
    const r = execSync(
      `node ${path.join(process.cwd(), 'scripts', 'feed-sync.mjs')} --manifest ${JSON.stringify(manifestPath)} --config-dir ${JSON.stringify(cfg)}`,
      { env: { ...process.env, FEED_SIGNING_KEY: 'secret' }, encoding: 'utf8' },
    );
    expect(r).toContain('applied');
    const rules = JSON.parse(fs.readFileSync(path.join(cfg, 'feed-rules.json'), 'utf8')) as { addEndpoints: string[] };
    expect(rules.addEndpoints).toContain('/api/monetize');
  });
});
