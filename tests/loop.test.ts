import { describe, it, expect } from 'vitest';
import { AdInterceptor } from '../src/interceptor.js';
import { Logger } from '../src/logger.js';
import { RuleRegistry } from '../src/rule-registry.js';
import { DEFAULT_CONFIG } from '../src/types.js';

describe('Loop: healed route blocks', () => {
  it('blocks a synthesized unknown ad route via token fallback', () => {
    const logger = new Logger('error', false);
    const reg = new RuleRegistry();
    reg.apply({ addEndpoints: ['/api/ad/brand-new-surface'], addSelectors: {} });
    const interceptor = new AdInterceptor(DEFAULT_CONFIG, logger, undefined, undefined, reg);
    const res = interceptor.intercept('https://freebuff.com/api/ad/brand-new-surface', 'GET');
    expect(res.blocked).toBe(true);
  });

  it('still lets controls through', () => {
    const logger = new Logger('error', false);
    const interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);
    const res = interceptor.intercept('https://freebuff.com/healthz', 'GET');
    expect(res.blocked).toBe(false);
  });
});
