import { describe, it, expect } from 'vitest';
import { canonicalize, matchRoute } from '../src/url-match.js';

describe('canonicalize', () => {
  it('keeps a non-default port and sorts query parameters', () => {
    expect(canonicalize('http://Example.com:8080/b//a?z=1&a=2')).toBe('http://example.com:8080/b/a?a=2&z=1');
  });

  it('strips default ports and lowercases the host', () => {
    expect(canonicalize('http://Example.com:80/a')).toBe('http://example.com/a');
    expect(canonicalize('https://Example.com:443/a')).toBe('https://example.com/a');
  });

  it('drops an empty query string', () => {
    expect(canonicalize('http://example.com/a?')).toBe('http://example.com/a');
  });

  it('canonicalizes a path-only value', () => {
    expect(canonicalize('/API//Ad/Break')).toBe('/api/ad/break');
  });
});

describe('matchRoute absolute patterns', () => {
  it('matches an exact absolute URL', () => {
    expect(matchRoute('https://ads.example.com/api/ad/break', 'https://ads.example.com/api/ad/break')).toBe(true);
    expect(matchRoute('https://ads.example.com/api/ad/other', 'https://ads.example.com/api/ad/break')).toBe(false);
  });

  it('matches a sub-path under a prefix pattern', () => {
    expect(matchRoute('https://ads.example.com/api/ad/break/7', 'https://ads.example.com/api/ad/break')).toBe(true);
    expect(matchRoute('https://ads.example.com/api/ad/break?x=1', 'https://ads.example.com/api/ad/break')).toBe(true);
  });

  it('matches a trailing-slash pattern as a prefix', () => {
    expect(matchRoute('https://ads.example.com/api/ad/', 'https://ads.example.com/api/ad/')).toBe(true);
    expect(matchRoute('https://ads.example.com/api/ad/break', 'https://ads.example.com/api/ad/')).toBe(true);
  });

  it('is case-insensitive on the path', () => {
    expect(matchRoute('http://x/API/AD/Break', '/api/ad/break')).toBe(true);
  });

  it('keeps a path-only match working when the URL is not parseable', () => {
    expect(matchRoute('/not a url', '/not a url')).toBe(true);
    expect(matchRoute('other', '/not a url')).toBe(false);
  });
});
