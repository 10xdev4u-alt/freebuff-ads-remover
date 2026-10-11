import type { AdStage, AdSurface, BlockEvent, StatsSnapshot } from './types.js';
import { AD_STAGES, AD_SURFACES } from './types.js';

const MAX_RECENT = 20;
const MINUTE_WINDOW = 30;

function zeroRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  const record = {} as Record<T, number>;
  for (const key of keys) {
    record[key] = 0;
  }
  return record;
}

/**
 * In-memory session statistics for blocked ad requests. Pure and
 * clock-injected so the dashboard pipeline is testable without timers.
 */
export class StatsStore {
  private readonly now: () => number;
  private startedAt: number;
  private total: number;
  private byStage: Record<AdStage, number>;
  private bySurface: Record<AdSurface, number>;
  private byEndpoint: Record<string, number>;
  private recent: BlockEvent[];
  private perMinute: { minute: number; count: number }[];

  constructor(now: () => number = Date.now) {
    this.now = now;
    this.startedAt = now();
    this.total = 0;
    this.byStage = zeroRecord(AD_STAGES);
    this.bySurface = zeroRecord(AD_SURFACES);
    this.byEndpoint = {};
    this.recent = [];
    this.perMinute = [];
  }

  record(entry: { stage: AdStage; surface: AdSurface; endpoint: string }): BlockEvent {
    const event: BlockEvent = { ...entry, at: this.now() };
    this.total += 1;
    this.byStage[event.stage] += 1;
    this.bySurface[event.surface] += 1;
    this.byEndpoint[event.endpoint] = (this.byEndpoint[event.endpoint] ?? 0) + 1;

    this.recent.unshift(event);
    if (this.recent.length > MAX_RECENT) {
      this.recent.length = MAX_RECENT;
    }

    this.bucketMinute(Math.floor(event.at / 60_000));
    return event;
  }

  snapshot(): StatsSnapshot {
    return {
      total: this.total,
      at: this.now(),
      startedAt: this.startedAt,
      byStage: { ...this.byStage },
      bySurface: { ...this.bySurface },
      byEndpoint: { ...this.byEndpoint },
      recent: this.recent.map((event) => ({ ...event })),
      perMinute: this.perMinute.map((bucket) => ({ ...bucket })),
    };
  }

  reset(): void {
    this.startedAt = this.now();
    this.total = 0;
    this.byStage = zeroRecord(AD_STAGES);
    this.bySurface = zeroRecord(AD_SURFACES);
    this.byEndpoint = {};
    this.recent = [];
    this.perMinute = [];
  }

  private bucketMinute(minute: number): void {
    const last = this.perMinute[this.perMinute.length - 1];
    if (last && last.minute === minute) {
      last.count += 1;
    } else {
      this.perMinute.push({ minute, count: 1 });
    }
    const cutoff = minute - (MINUTE_WINDOW - 1);
    while (this.perMinute.length > 0 && (this.perMinute[0]?.minute ?? 0) < cutoff) {
      this.perMinute.shift();
    }
  }
}
