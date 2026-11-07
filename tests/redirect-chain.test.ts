import { describe, it, expect } from 'vitest';
import { createChainTracker } from '../src/redirect-chain.js';

describe('redirect-chain', () => {
  it('marks chain ad if any hop is ad', () => {
    const t = createChainTracker((u) => u.includes('/api/ad/'));
    t.record('r1', 'http://x/home');
    t.redirect('r1', 'http://x/api/ad/break');
    expect(t.isAdChain('r1')).toBe(true);
    expect(t.complete('r1')).toBe(true);
  });
  it('non-ad chain returns false', () => {
    const t = createChainTracker((u) => u.includes('/api/ad/'));
    t.record('r2', 'http://x/home');
    t.redirect('r2', 'http://x/page');
    expect(t.complete('r2')).toBe(false);
  });
});
