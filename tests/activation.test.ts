import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { activate, deactivate } from '../src/bootstrap.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('Activation: real bootstrap path', () => {
  let captured: ((details: unknown, cb: (r: unknown) => void) => void) | null = null;
  let fakeSession: { defaultSession: { webRequest: { onBeforeRequest: (f: unknown, l: unknown) => void } } };

  beforeEach(() => {
    captured = null;
    fakeSession = {
      defaultSession: {
        webRequest: {
          onBeforeRequest: (_filter: unknown, listener: unknown) => {
            captured = listener as (details: unknown, cb: (r: unknown) => void) => void;
          },
        },
      },
    };
    // point config at a temp dir
    process.env.FREEBUFF_CONFIG_DIR = '/tmp/opencode/fb-test-' + Math.random().toString(36).slice(2);
    fs.mkdirSync(process.env.FREEBUFF_CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    deactivate();
    delete process.env.FREEBUFF_CONFIG_DIR;
  });

  it('registers a webRequest listener and blocks every ad route in the corpus', () => {
    const ok = activate(fakeSession as unknown, undefined);
    expect(ok).toBe(true);
    expect(captured).not.toBeNull();

    const corpusPath = path.resolve('corpus/golden.jsonl');
    const lines = fs.readFileSync(corpusPath, 'utf8').trim().split('\n');
    let ads = 0;
    let controls = 0;
    for (const line of lines) {
      const entry = JSON.parse(line) as { path: string; label: string };
      const url = 'https://freebuff.com' + entry.path;
      let result: unknown = null;
      captured!({ url, method: 'GET' }, (r) => { result = r; });
      if (entry.label === 'ad') {
        ads++;
        expect(result).toEqual({ cancel: true });
      } else {
        controls++;
        expect(result).toEqual({});
      }
    }
    expect(ads).toBeGreaterThan(0);
    expect(controls).toBeGreaterThan(0);
  });

  it('corpus manifest hash matches', () => {
    const corpusPath = path.resolve('corpus/golden.jsonl');
    const buf = fs.readFileSync(corpusPath);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const manifest = JSON.parse(fs.readFileSync(path.resolve('corpus/manifest.json'), 'utf8'));
    expect(hash).toBe(manifest.sha256);
  });
});
