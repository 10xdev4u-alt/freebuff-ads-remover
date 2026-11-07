import { describe, it, expect } from 'vitest';
import { replay } from '../src/replay.js';
import type { ShadowEntry } from '../src/shadow-capture.js';

function entry(path: string, blocked: boolean): ShadowEntry {
  return { v: 1, at: 1, method: 'GET', path, originHash: 'h', session: 's', decision: { blocked }, ms: 1 };
}

describe('replay', () => {
  it('perfect precision and recall', () => {
    const entries = [entry('/api/ad/policy', true), entry('/healthz', false)];
    const matcher = { isBlocked: (p: string) => p.startsWith('/api/ad/'), endpoints: 1 };
    const r = replay(entries, matcher);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
    expect(r.pass).toBe(true);
  });
  it('false positive fails precision', () => {
    const entries = [entry('/healthz', false)];
    const matcher = { isBlocked: () => true, endpoints: 1 };
    const r = replay(entries, matcher);
    expect(r.precision).toBe(0);
    expect(r.pass).toBe(false);
    expect(r.falsePositives).toHaveLength(1);
  });
  it('missed ad fails recall', () => {
    const entries = [entry('/api/ad/policy', true)];
    const matcher = { isBlocked: () => false, endpoints: 0 };
    const r = replay(entries, matcher);
    expect(r.recall).toBe(0);
    expect(r.missedAds).toHaveLength(1);
  });
  it('empty capture passes', () => {
    const r = replay([], { isBlocked: () => false, endpoints: 0 });
    expect(r.pass).toBe(true);
  });
});
