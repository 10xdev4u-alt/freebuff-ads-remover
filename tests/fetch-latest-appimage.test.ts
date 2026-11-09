import { describe, it, expect } from 'vitest';
import { normalizeVersion, compareVersions } from '../scripts/fetch-latest-appimage.mjs';

describe('fetch-latest-appimage', () => {
  it('normalizes a leading v', () => {
    expect(normalizeVersion('v0.0.201')).toBe('0.0.201');
    expect(normalizeVersion('0.0.201')).toBe('0.0.201');
  });
  it('compares numeric versions', () => {
    expect(compareVersions('0.0.99', '0.0.201')).toBeLessThan(0);
    expect(compareVersions('0.0.201', '0.0.201')).toBe(0);
    expect(compareVersions('0.0.202', '0.0.201')).toBeGreaterThan(0);
  });
});
