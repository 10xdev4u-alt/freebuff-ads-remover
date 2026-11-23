import { describe, it, expect } from 'vitest';
import { isAdRoute, isControlRoute, normalizeRoute } from '../src/ad-heuristics.js';

describe('ad-heuristics extra branches', () => {
  it('ignores the bare ad base path', () => {
    expect(isAdRoute('/api/ad/')).toBe(false);
  });

  it('rejects routes that merely contain a non-ad word', () => {
    expect(isAdRoute('/api/admin/ad')).toBe(false);
    expect(isAdRoute('/api/address/ad')).toBe(false);
  });

  it('matches the extra ad markers', () => {
    expect(isAdRoute('/api/telemetry/display-ad')).toBe(true);
    expect(isAdRoute('/api/ads/creative-image/x')).toBe(true);
  });

  it('falls back to the raw route when normalization empties it', () => {
    expect(normalizeRoute('?x=1')).toBe('?x=1');
    expect(normalizeRoute('/api/ad/x?y=1')).toBe('/api/ad/x');
  });

  it('only treats the explicit allow-list as controls', () => {
    expect(isControlRoute('/api/user/me')).toBe(true);
    expect(isControlRoute('/api/unknown')).toBe(false);
  });
});
