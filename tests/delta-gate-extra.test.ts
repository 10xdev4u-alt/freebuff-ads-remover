import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { RuleRegistry } from '../src/rule-registry.js';
import { verifyDelta } from '../src/delta-gate.js';

const repo = path.resolve(__dirname, '..');
const realCorpus = path.join(repo, 'corpus');

function makeCorpus(entries: { path: string; label: 'ad' | 'control' }[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-corpus-'));
  const raw = entries.map((e) => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'golden.jsonl'), raw);
  const sha = crypto.createHash('sha256').update(raw).digest('hex');
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      version: 1,
      freebuffVersion: 'test',
      entries: entries.length,
      ads: entries.filter((e) => e.label === 'ad').length,
      controls: entries.filter((e) => e.label === 'control').length,
      sha256: sha,
    }),
  );
  return dir;
}

describe('verifyDelta branches', () => {
  it('rejects an endpoint that collides with a non-ad segment', () => {
    const gate = verifyDelta(
      { addEndpoints: ['/api/threads/ad-like'], addSelectors: {}, source: 'test' },
      new RuleRegistry(),
      realCorpus,
    );
    expect(gate.pass).toBe(false);
    expect(gate.reason).toBe('protected-route-collision');
  });

  it('rejects a host rule containing a path or query', () => {
    const registry = new RuleRegistry();
    for (const host of ['ads.example.com/asset', 'ads.example.com?x=1']) {
      const gate = verifyDelta({ addEndpoints: [], addHosts: [host], addSelectors: {}, source: 'test' }, registry, realCorpus);
      expect(gate.pass).toBe(false);
      expect(gate.reason).toBe('protected-host-collision');
    }
  });

  it('reports a control false positive when a broad endpoint swallows a control route', () => {
    const gate = verifyDelta(
      { addEndpoints: ['/api'], addSelectors: {}, source: 'test' },
      new RuleRegistry(),
      realCorpus,
    );
    expect(gate.pass).toBe(false);
    expect(gate.reason).toBe('control-false-positive');
    expect(gate.fps.length).toBeGreaterThan(0);
  });

  it('reports missed golden ads and fails recall', () => {
    const corpus = makeCorpus([
      { path: '/api/brand-new-ad-route', label: 'ad' },
      { path: '/healthz', label: 'control' },
    ]);
    const gate = verifyDelta(
      { addEndpoints: ['/api/ad/custom'], addSelectors: {}, source: 'test' },
      new RuleRegistry(),
      corpus,
    );
    expect(gate.pass).toBe(false);
    expect(gate.reason).toBe('missed-golden-ads');
    expect(gate.missed).toEqual(['/api/brand-new-ad-route']);
    expect(gate.recall).toBe(0);
  });

  it('treats an ad-free corpus as perfect recall', () => {
    const corpus = makeCorpus([{ path: '/healthz', label: 'control' }]);
    const gate = verifyDelta(
      { addEndpoints: ['/api/ad/custom'], addSelectors: {}, source: 'test' },
      new RuleRegistry(),
      corpus,
    );
    expect(gate.pass).toBe(true);
    expect(gate.recall).toBe(1);
  });

  it('treats a control-free corpus as perfect precision', () => {
    const corpus = makeCorpus([{ path: '/api/ad/break', label: 'ad' }]);
    const gate = verifyDelta(
      { addEndpoints: ['/api/ad/custom'], addSelectors: {}, source: 'test' },
      new RuleRegistry(),
      corpus,
    );
    expect(gate.pass).toBe(true);
    expect(gate.precision).toBe(1);
  });

  it('honours custom floors and returns no reason when nothing was missed', () => {
    const gate = verifyDelta(
      { addEndpoints: ['/api/ad/custom'], addSelectors: {}, source: 'test' },
      new RuleRegistry(),
      realCorpus,
      { recall: 2, precision: 1 },
    );
    expect(gate.pass).toBe(false);
    expect(gate.reason).toBeUndefined();
  });
});
