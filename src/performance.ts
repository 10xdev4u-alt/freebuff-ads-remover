export interface PerformanceMetrics {
  totalRequests: number;
  blockedRequests: number;
  averageLatencyMs: number;
  peakLatencyMs: number;
  memoryUsageMB: number;
  uptimeSeconds: number;
  lastUpdated: string;
}

export class PerformanceMonitor {
  private startTime: number;
  private totalRequests: number;
  private blockedRequests: number;
  private latencies: number[];
  private maxLatencies: number;

  constructor(maxLatencies = 1000) {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.blockedRequests = 0;
    this.latencies = [];
    this.maxLatencies = maxLatencies;
  }

  recordRequest(latencyMs: number, blocked: boolean): void {
    this.totalRequests++;
    if (blocked) {
      this.blockedRequests++;
    }

    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxLatencies) {
      this.latencies.shift();
    }
  }

  getMetrics(): PerformanceMetrics {
    const latencies = this.latencies;
    const avgLatency =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;
    const peakLatency = latencies.length > 0 ? Math.max(...latencies) : 0;

    return {
      totalRequests: this.totalRequests,
      blockedRequests: this.blockedRequests,
      averageLatencyMs: Math.round(avgLatency * 100) / 100,
      peakLatencyMs: Math.round(peakLatency * 100) / 100,
      memoryUsageMB: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 1000),
      lastUpdated: new Date().toISOString(),
    };
  }

  reset(): void {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.blockedRequests = 0;
    this.latencies = [];
  }
}
