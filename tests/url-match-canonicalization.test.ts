import { describe, it, expect } from 'vitest';
import { canonicalize, matchRoute } from '../src/url-match.js';

describe('path-only URL canonicalization', () => {
  it('collapses duplicate slashes in an absolute ad URL', () => {
    expect(matchRoute('https://freebuff.com/api//ad/break', '/api/ad/break')).toBe(true);
  });

  it('collapses duplicate slashes in a path-only ad URL', () => {
    expect(matchRoute('/api//ad/break', '/api/ad/break')).toBe(true);
  });

  it('matches a duplicate-slash URL with query variants', () => {
    expect(matchRoute('https://freebuff.com/api//ad/break?placement=home', '/api/ad/break')).toBe(true);
  });

  it('matches duplicate slashes with case variants', () => {
    expect(matchRoute('/API//AD/Break?Placement=HOME', '/api/ad/break')).toBe(true);
  });

  it('collapses duplicate slashes on the pattern side too', () => {
    expect(matchRoute('https://freebuff.com/api/ad/break', '/api//ad/break')).toBe(true);
  });

  it('keeps already-passing variants green', () => {
    expect(matchRoute('https://freebuff.com/api/ad/break?placement=home', '/api/ad/break')).toBe(true);
    expect(matchRoute('https://freebuff.com/API/AD/Break', '/api/ad/break')).toBe(true);
    expect(matchRoute('https://freebuff.com/api/ad/break/', '/api/ad/break')).toBe(true);
  });

  it('canonicalizes absolute URLs without dropping their query', () => {
    const c = canonicalize('https://freebuff.com/API//AD/Break?b=2&a=1');
    expect(c).toContain('/api/ad/break');
    expect(c).toContain('a=1&b=2');
  });
});
