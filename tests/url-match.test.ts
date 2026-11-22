import { describe, it, expect } from 'vitest';
import { canonicalize, matchRoute } from '../src/url-match.js';

describe('url-match', () => {
  it('canonicalize is idempotent', () => {
    const u = 'http://Example.com:80/a//b?z=1&a=2';
    expect(canonicalize(canonicalize(u))).toBe(canonicalize(u));
  });
  it('matches substring path', () => {
    expect(matchRoute('http://x/api/ad/break', '/api/ad/break')).toBe(true);
  });
  it('does not throw on bad url', () => {
    expect(() => matchRoute('not a url', '/x')).not.toThrow();
  });
  it('does not throw on malformed percent-encoding', () => {
    expect(() => matchRoute('http://x/api/ad/%ZZ', '/api/ad/')).not.toThrow();
    expect(matchRoute('http://x/api/ad/%ZZ', '/api/ad/')).toBe(true);
    expect(matchRoute('http://x/api/ad/%ZZ', '/api/other/')).toBe(false);
  });
});
