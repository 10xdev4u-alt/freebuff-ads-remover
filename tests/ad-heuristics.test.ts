import { describe, it, expect } from 'vitest';
import { isAdRoute, isControlRoute, normalizeRoute } from '../src/ad-heuristics.js';

describe('ad-heuristics', () => {
  it('classifies ad routes', () => {
    expect(isAdRoute('/api/ad/policy')).toBe(true);
    expect(isAdRoute('/api/telemetry/ad-density')).toBe(true);
  });
  it('rejects controls', () => {
    expect(isAdRoute('/healthz')).toBe(false);
    expect(isControlRoute('/healthz')).toBe(true);
  });
  it('normalizes params', () => {
    expect(normalizeRoute('/api/ad/foo/${id}')).toBe('/api/ad/foo/:param');
  });
});
