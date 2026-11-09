import { describe, it, expect } from 'vitest';
import { classifyRoute, CONTROL_ROUTES } from '../src/candidates.js';

describe('candidate classifier', () => {
  it('flags a renamed monetize route as a candidate', () => {
    const r = classifyRoute('/api/monetize/impression');
    expect(r.candidate).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(0.35);
    expect(r.signals.join(' ')).toContain('monetize');
  });

  it('does not flag a control route', () => {
    const r = classifyRoute('/healthz');
    expect(r.candidate).toBe(false);
    expect(CONTROL_ROUTES.has('/healthz')).toBe(true);
  });

  it('is deterministic', () => {
    expect(classifyRoute('/api/ad/break')).toEqual(classifyRoute('/api/ad/break'));
  });

  it('uses call-site context to raise confidence', () => {
    const base = classifyRoute('/api/foo');
    const boosted = classifyRoute('/api/foo', { module: 'ad-banner', params: ['placement'] });
    expect(boosted.confidence).toBeGreaterThan(base.confidence);
  });

  it('rejects a hyphenated protected segment', () => {
    const r = classifyRoute('/api/survey-events');
    expect(r.candidate).toBe(false);
    expect(r.signals).toContain('not-ad-segment');
  });
});
