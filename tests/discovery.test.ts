import { describe, it, expect } from 'vitest';
import { discover } from '../src/discovery.js';
import type { ShadowEntry } from '../src/shadow-capture.js';

function entry(path: string, blocked: boolean): ShadowEntry {
  return { v: 1, at: 1, method: 'GET', path, originHash: 'h', session: 's', decision: { blocked }, ms: 1 };
}

describe('discovery', () => {
  it('proposes repeated unblocked ad-token paths', () => {
    const entries = [
      entry('/api/ad/newthing', false),
      entry('/api/ad/newthing', false),
      entry('/api/ad/newthing', false),
    ];
    const c = discover(entries, 3);
    expect(c).toHaveLength(1);
    expect(c[0]!.path).toBe('/api/ad/newthing');
  });
  it('ignores already-blocked', () => {
    const entries = [entry('/api/ad/policy', true), entry('/api/ad/policy', true), entry('/api/ad/policy', true)];
    expect(discover(entries, 3)).toHaveLength(0);
  });
  it('ignores non-ad paths', () => {
    const entries = [entry('/api/account/usage', false), entry('/api/account/usage', false), entry('/api/account/usage', false)];
    expect(discover(entries, 3)).toHaveLength(0);
  });
  it('respects minCount', () => {
    const entries = [entry('/api/ad/rare', false), entry('/api/ad/rare', false)];
    expect(discover(entries, 3)).toHaveLength(0);
    expect(discover(entries, 2)).toHaveLength(1);
  });
});
