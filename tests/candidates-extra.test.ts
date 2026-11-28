import { describe, it, expect } from 'vitest';
import { classifyRoute, isFirstPartyHost, normalizeHost } from '../src/candidates.js';

describe('normalizeHost', () => {
  it('returns an empty string for blank input', () => {
    expect(normalizeHost('')).toBe('');
    expect(normalizeHost('   ')).toBe('');
  });

  it('normalizes hosts, origins and URLs', () => {
    expect(normalizeHost('ADS.example.com.')).toBe('ads.example.com');
    expect(normalizeHost('https://ads.example.com:8080/path?q=1')).toBe('ads.example.com');
    expect(normalizeHost('http://[::1]:8080/')).toBe('::1');
  });

  it('falls back to the text before the first slash when unparseable', () => {
    expect(normalizeHost('not a url')).toBe('not a url');
  });
});

describe('isFirstPartyHost', () => {
  it('accepts Freebuff hosts and subdomains only', () => {
    expect(isFirstPartyHost('')).toBe(false);
    expect(isFirstPartyHost('freebuff.com')).toBe(true);
    expect(isFirstPartyHost('api.freebuff.com')).toBe(true);
    expect(isFirstPartyHost('localhost')).toBe(true);
    expect(isFirstPartyHost('127.0.0.1')).toBe(true);
    expect(isFirstPartyHost('::1')).toBe(true);
    expect(isFirstPartyHost('freebuff.com.evil.example')).toBe(false);
    expect(isFirstPartyHost('evil.example')).toBe(false);
  });
});

describe('classifyRoute', () => {
  it('ignores the bare ad base path and non-ad segments', () => {
    expect(classifyRoute('/api/ad/')).toEqual({ candidate: false, confidence: 0, signals: ['ignore-base-path'] });
    expect(classifyRoute('/api/threads/ad')).toEqual({ candidate: false, confidence: 0, signals: ['not-ad-segment'] });
  });

  it('never classifies a control route as a candidate', () => {
    expect(classifyRoute('/healthz')).toEqual({ candidate: false, confidence: 0, signals: ['control-list'] });
  });

  it.each([
    '/healthz?x=ad',
    '/api/account/usage?utm_campaign=promo',
    '/api/user/me?ref=sponsor',
    '/api/config?debug=advertising',
    '/api/auth/session?x=ads',
  ])('ignores ad tokens that appear only in the query string of %s', (route) => {
    expect(classifyRoute(route)).toEqual({ candidate: false, confidence: 0, signals: ['control-list'] });
  });

  it('scores path tokens', () => {
    const result = classifyRoute('/api/ad/break');
    expect(result.candidate).toBe(true);
    expect(result.signals).toContain('path:ad,break');
  });

  it('adds host, module and parameter signals', () => {
    const result = classifyRoute('/api/v1/ads/x', { host: 'ads.example.com', module: 'ad-server', params: ['placementId'] });
    expect(result.signals).toContain('host:ads.example.com');
    expect(result.signals).toContain('module:ad-server');
    expect(result.signals).toContain('params:placementId');
  });

  it('derives the host from the route when no context host is given', () => {
    const result = classifyRoute('https://ads.example.com/api/ad/break');
    expect(result.signals).toContain('host:ads.example.com');
  });

  it('reports below-threshold routes as non-candidates', () => {
    const result = classifyRoute('/api/chat/history');
    expect(result.candidate).toBe(false);
    expect(result.signals).toContain('below-threshold');
  });

  it('ignores a module that does not look ad-related', () => {
    const result = classifyRoute('/api/chat/history', { module: 'user-profile' });
    expect(result.signals).not.toContain('module:user-profile');
  });
});
