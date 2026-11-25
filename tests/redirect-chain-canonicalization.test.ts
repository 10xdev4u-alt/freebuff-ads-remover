import { describe, it, expect } from 'vitest';
import { createChainTracker } from '../src/redirect-chain.js';
import { matchRoute } from '../src/url-match.js';

const tracker = () => createChainTracker((url) => matchRoute(url, '/api/ad/break'));

describe('redirect chain ad-flag preservation', () => {
  it('keeps an ad flag when the same request id is recorded again', () => {
    const t = tracker();
    t.record(1, 'https://freebuff.com/api/ad/break');
    t.record(1, 'https://freebuff.com/landing');
    expect(t.isAdChain(1)).toBe(true);
    expect(t.complete(1)).toBe(true);
  });

  it('flags a chain whose redirect lands on an ad endpoint', () => {
    const t = tracker();
    t.record(2, 'https://freebuff.com/landing');
    t.redirect(2, '/go?to=home');
    t.redirect(2, '/API//AD/Break?placement=home');
    expect(t.isAdChain(2)).toBe(true);
    expect(t.complete(2)).toBe(true);
  });

  it('does not flag a clean multi-hop chain', () => {
    const t = tracker();
    t.record(3, '/home');
    t.redirect(3, '/api/ad/other');
    expect(t.complete(3)).toBe(false);
  });

  it('seeds an ad chain from a redirect with no prior record', () => {
    const t = tracker();
    t.redirect(4, '/api/ad/break');
    expect(t.complete(4)).toBe(true);
  });

  it('clears the chain after completion', () => {
    const t = tracker();
    t.record(5, '/api/ad/break');
    expect(t.complete(5)).toBe(true);
    expect(t.isAdChain(5)).toBe(false);
    expect(t.complete(5)).toBe(false);
  });
});
