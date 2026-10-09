import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceMonitor } from '../src/performance.js';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  it('starts with zero metrics', () => {
    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.blockedRequests).toBe(0);
    expect(metrics.averageLatencyMs).toBe(0);
  });

  it('records requests', () => {
    monitor.recordRequest(0.5, true);
    monitor.recordRequest(0.3, false);

    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.blockedRequests).toBe(1);
  });

  it('calculates average latency', () => {
    monitor.recordRequest(1.0, false);
    monitor.recordRequest(2.0, false);
    monitor.recordRequest(3.0, false);

    const metrics = monitor.getMetrics();
    expect(metrics.averageLatencyMs).toBe(2.0);
  });

  it('tracks peak latency', () => {
    monitor.recordRequest(0.5, false);
    monitor.recordRequest(2.5, false);
    monitor.recordRequest(1.0, false);

    const metrics = monitor.getMetrics();
    expect(metrics.peakLatencyMs).toBe(2.5);
  });

  it('resets metrics', () => {
    monitor.recordRequest(1.0, true);
    monitor.reset();

    const metrics = monitor.getMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.blockedRequests).toBe(0);
  });

  it('tracks uptime', () => {
    const metrics = monitor.getMetrics();
    expect(metrics.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('includes memory usage', () => {
    const metrics = monitor.getMetrics();
    expect(metrics.memoryUsageMB).toBeGreaterThan(0);
  });

  it('limits stored latencies', () => {
    const smallMonitor = new PerformanceMonitor(3);
    smallMonitor.recordRequest(1.0, false);
    smallMonitor.recordRequest(2.0, false);
    smallMonitor.recordRequest(3.0, false);
    smallMonitor.recordRequest(4.0, false);

    const metrics = smallMonitor.getMetrics();
    expect(metrics.peakLatencyMs).toBe(4.0);
    expect(metrics.averageLatencyMs).toBe(3.0);
  });
});
