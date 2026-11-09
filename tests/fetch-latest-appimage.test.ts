import { describe, it, expect } from 'vitest';
import * as fetchModRaw from '../scripts/fetch-latest-appimage.mjs';
const fetchMod = fetchModRaw as unknown as { normalizeVersion: (v: unknown) => string; compareVersions: (a: unknown, b: unknown) => number };
const normalizeVersion = fetchMod.normalizeVersion;
const compareVersions = fetchMod.compareVersions;

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
