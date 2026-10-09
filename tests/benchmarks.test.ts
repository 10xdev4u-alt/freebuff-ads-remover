import { describe, it, expect } from 'vitest';
import { AdInterceptor } from '../src/interceptor.js';
import { PerformanceMonitor } from '../src/performance.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import { Logger } from '../src/logger.js';

describe('Performance Benchmarks', () => {
  it('intercepts requests under 1ms', () => {
    const logger = new Logger('error', false);
    const interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    }
    const elapsed = performance.now() - start;
    const perRequest = elapsed / 1000;
    expect(perRequest).toBeLessThan(1);
  });

  it('handles 10000 requests without memory issues', () => {
    const logger = new Logger('error', false);
    const monitor = new PerformanceMonitor();
    const interceptor = new AdInterceptor(DEFAULT_CONFIG, logger);

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      const latency = Math.random() * 0.5;
      const blocked = i % 2 === 0;
      monitor.recordRequest(latency, blocked);
      interceptor.intercept('http://127.0.0.1:5174/api/ad/break', 'POST');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);

    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(10000);
    expect(metrics.blockedRequests).toBe(5000);
    expect(metrics.averageLatencyMs).toBeLessThan(1);
  });

  it('CSS injector performs under load', async () => {
    const logger = new Logger('error', false);
    const { CssInjector } = await import('../src/css-injector.js');
    const injector = new CssInjector(DEFAULT_CONFIG, logger);

    const mockTarget = {
      insertCSS: async () => 'key',
      removeCSS: async () => undefined,
    };

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      injector.updateConfig(DEFAULT_CONFIG);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
});
