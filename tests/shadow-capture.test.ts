import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ShadowCapture } from '../src/shadow-capture.js';

describe('ShadowCapture', () => {
  it('hashes origin', () => {
    expect(ShadowCapture.hashOrigin('https://freebuff.com')).toMatch(/^sha256:[0-9a-f]{16}$/);
  });
  it('scrubs query by default', () => {
    const r = ShadowCapture.scrubPath('https://freebuff.com/api/ad/policy?token=secret', true);
    expect(r.path).toBe('/api/ad/policy');
    expect(r.path).not.toContain('secret');
  });
  it('records when enabled', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
    const sc = new ShadowCapture({ enabled: true, captureDir: tmp, scrubQuery: true });
    expect(sc.isEnabled()).toBe(true);
    sc.record({ at: Date.now(), method: 'GET', path: '/api/ad/policy', originHash: 'sha256:x', session: 'default', decision: { blocked: true }, ms: 1 });
    const content = fs.readFileSync(path.join(tmp, 'capture.jsonl'), 'utf8');
    expect(content).toContain('/api/ad/policy');
    expect(content).not.toContain('token');
  });
  it('disabled does not record', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sc2-'));
    const sc = new ShadowCapture({ enabled: false, captureDir: tmp });
    sc.record({ at: Date.now(), method: 'GET', path: '/x', originHash: 'h', session: 's', decision: { blocked: false }, ms: 0 });
    expect(fs.existsSync(path.join(tmp, 'capture.jsonl'))).toBe(false);
  });
  it('dryRun flag', () => {
    const sc = new ShadowCapture({ enabled: true, dryRun: true });
    expect(sc.isDryRun()).toBe(true);
  });
});
