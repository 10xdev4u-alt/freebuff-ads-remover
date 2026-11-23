import { describe, it, expect } from 'vitest';
import { discover } from '../src/discovery.js';
import type { ShadowEntry } from '../src/shadow-capture.js';

function entry(path: string, blocked = false): ShadowEntry {
  return { v: 1, at: 1, method: 'GET', path, originHash: 'h', session: 's', decision: { blocked }, ms: 1 };
}

describe('discovery extra branches', () => {
  it('rejects ad-token paths that contain a non-ad word', () => {
    const entries = [
      entry('/api/admin/ad-panel'),
      entry('/api/admin/ad-panel'),
      entry('/api/admin/ad-panel'),
    ];
    expect(discover(entries, 3)).toHaveLength(0);
  });

  it('sorts candidates by count descending', () => {
    const entries = [
      entry('/api/ad/common'),
      entry('/api/ad/common'),
      entry('/api/ad/common'),
      entry('/api/ad/rare'),
      entry('/api/ad/rare'),
      entry('/api/ad/rare'),
      entry('/api/ad/rare'),
    ];
    const candidates = discover(entries, 2);
    expect(candidates[0]?.path).toBe('/api/ad/rare');
    expect(candidates[0]?.count).toBe(4);
  });
});
