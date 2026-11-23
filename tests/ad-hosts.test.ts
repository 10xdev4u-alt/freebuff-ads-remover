import { describe, it, expect, beforeEach } from 'vitest';
import { AdInterceptor } from '../src/interceptor.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { isFirstPartyHost } from '../src/candidates.js';
import { RuleRegistry } from '../src/rule-registry.js';
import { verifyDelta } from '../src/delta-gate.js';
import path from 'node:path';

describe('ad host blocking', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('error', false);
  });

  it('blocks any path on a configured ad host', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['ads.example.com'] }, logger);
    const result = interceptor.intercept('https://ads.example.com/pixel.gif', 'GET');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('Ad host: ads.example.com');
    expect(result.endpoint).toBe('ads.example.com');
    expect(result.surface).toBe('sponsorBreak');
  });

  it('accepts an origin-form entry', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['https://ads.example.com/'] }, logger);
    expect(interceptor.intercept('https://ads.example.com/api/ad/break', 'POST').blocked).toBe(true);
  });

  it('does not block a host that is not configured', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['ads.example.com'] }, logger);
    expect(interceptor.intercept('https://other.example.net/pixel.gif', 'GET').blocked).toBe(false);
  });

  it('never blocks a first-party host, even if configured', () => {
    const interceptor = new AdInterceptor(
      { ...DEFAULT_CONFIG, adHosts: ['freebuff.com', 'api.freebuff.com'] },
      logger,
    );
    expect(interceptor.intercept('https://freebuff.com/api/account/usage', 'GET').blocked).toBe(false);
    expect(interceptor.intercept('https://api.freebuff.com/api/account/usage', 'GET').blocked).toBe(false);
  });

  it('matches hostnames case-insensitively', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['ADS.Example.com'] }, logger);
    expect(interceptor.intercept('https://ads.example.com/x', 'GET').blocked).toBe(true);
  });

  it('does not match a lookalike host', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['freebuff.com'] }, logger);
    expect(interceptor.intercept('https://freebuff.com.evil.example/x', 'GET').blocked).toBe(false);
  });

  it('leaves path blocking untouched when no host is configured', () => {
    const interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);
    expect(interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST').blocked).toBe(true);
    expect(interceptor.intercept('https://ads.example.com/pixel.gif', 'GET').blocked).toBe(false);
  });

  it('reports a configured ad host through isAdUrl', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['ads.example.com'] }, logger);
    expect(interceptor.isAdUrl('https://ads.example.com/pixel.gif')).toBe(true);
    expect(interceptor.isAdUrl('https://other.example.net/pixel.gif')).toBe(false);
  });

  it('blocks a host carried by the rule registry (healed host rule)', () => {
    const registry = new RuleRegistry();
    registry.apply({ addEndpoints: [], addHosts: ['ads.example.com'], addSelectors: {}, source: 'ci-healed:test' });
    const interceptor = new AdInterceptor(DEFAULT_CONFIG, logger, undefined, undefined, registry);
    expect(interceptor.intercept('https://ads.example.com/pixel.gif', 'GET').blocked).toBe(true);
    expect(interceptor.intercept('https://freebuff.com/api/account/usage', 'GET').blocked).toBe(false);
  });

  it('blocks a trailing-dot spelling of a configured ad host', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['ads.example.com'] }, logger);
    expect(interceptor.intercept('https://ads.example.com./pixel.gif', 'GET').blocked).toBe(true);
  });

  it('does not block a trailing-dot spelling of a first-party host', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['freebuff.com.'] }, logger);
    expect(interceptor.intercept('https://freebuff.com./api/account/usage', 'GET').blocked).toBe(false);
  });

  it('does not block IPv6 loopback', () => {
    const interceptor = new AdInterceptor({ ...DEFAULT_CONFIG, adHosts: ['::1', '[::1]'] }, logger);
    expect(interceptor.intercept('http://[::1]/api/account/usage', 'GET').blocked).toBe(false);
  });

  it('rejects a host rule that targets a first-party host', () => {
    const registry = new RuleRegistry();
    const gate = verifyDelta(
      { addEndpoints: [], addHosts: ['freebuff.com'], addSelectors: {}, source: 'test' },
      registry,
      path.join(process.cwd(), 'corpus'),
    );
    expect(gate.pass).toBe(false);
    expect(gate.reason).toBe('protected-host-collision');
  });
});

describe('isFirstPartyHost', () => {
  it('treats Freebuff hosts and subdomains as first-party', () => {
    expect(isFirstPartyHost('freebuff.com')).toBe(true);
    expect(isFirstPartyHost('www.freebuff.com')).toBe(true);
    expect(isFirstPartyHost('api.freebuff.com')).toBe(true);
    expect(isFirstPartyHost('localhost')).toBe(true);
    expect(isFirstPartyHost('127.0.0.1')).toBe(true);
  });

  it('rejects lookalikes and third-party hosts', () => {
    expect(isFirstPartyHost('freebuff.com.evil.example')).toBe(false);
    expect(isFirstPartyHost('evilfreebuff.com')).toBe(false);
    expect(isFirstPartyHost('ads.example.com')).toBe(false);
  });

  it('treats IPv6 loopback as first-party', () => {
    expect(isFirstPartyHost('::1')).toBe(true);
    expect(isFirstPartyHost('[::1]')).toBe(true);
    expect(isFirstPartyHost('http://[::1]:5174/')).toBe(true);
  });

  it('normalizes origins, ports and trailing dots', () => {
    expect(isFirstPartyHost('https://api.freebuff.com:443/x')).toBe(true);
    expect(isFirstPartyHost('api.freebuff.com.')).toBe(true);
    expect(isFirstPartyHost('https://ads.example.com/')).toBe(false);
  });
});
