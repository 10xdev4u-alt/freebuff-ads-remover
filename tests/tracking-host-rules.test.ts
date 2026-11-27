import { describe, it, expect, beforeEach } from 'vitest';
import { AdInterceptor } from '../src/interceptor.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { RuleRegistry } from '../src/rule-registry.js';

describe('tracking exception vs ad host rules', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('error', false);
  });

  it('blocks a tracking path on a configured ad host when blockTracking is off', () => {
    const interceptor = new AdInterceptor(
      { ...DEFAULT_CONFIG, blockTracking: false, adHosts: ['ads.example.com'] }, logger,
    );
    const result = interceptor.intercept('https://ads.example.com/api/ad/impression', 'GET');
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('Ad host: ads.example.com');
    expect(interceptor.isAdUrl('https://ads.example.com/api/ad/impression')).toBe(true);
  });

  it('blocks a tracking path on a healed host rule when blockTracking is off', () => {
    const registry = new RuleRegistry();
    registry.apply({
      addEndpoints: [], addHosts: ['ads.example.com'], addSelectors: {}, source: 'ci-healed:test',
    });
    const interceptor = new AdInterceptor(
      { ...DEFAULT_CONFIG, blockTracking: false }, logger, undefined, undefined, registry,
    );
    expect(interceptor.intercept('https://ads.example.com/api/ad/break-event', 'POST').blocked).toBe(true);
    expect(interceptor.isAdUrl('https://ads.example.com/api/ad/break-event')).toBe(true);
  });

  it('still allows tracking on an unconfigured host when blockTracking is off', () => {
    const interceptor = new AdInterceptor(
      { ...DEFAULT_CONFIG, blockTracking: false, adHosts: ['ads.example.com'] }, logger,
    );
    expect(interceptor.intercept('https://metrics.example.net/api/ad/impression', 'GET').blocked).toBe(false);
    expect(interceptor.isAdUrl('https://metrics.example.net/api/ad/impression')).toBe(false);
  });

  it('still allows first-party tracking even when the host is configured', () => {
    const interceptor = new AdInterceptor(
      { ...DEFAULT_CONFIG, blockTracking: false, adHosts: ['freebuff.com'] }, logger,
    );
    expect(interceptor.intercept('https://freebuff.com/api/ad/impression', 'GET').blocked).toBe(false);
    expect(interceptor.isAdUrl('https://freebuff.com/api/ad/impression')).toBe(false);
  });
});
