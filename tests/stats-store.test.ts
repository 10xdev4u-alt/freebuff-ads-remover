import { describe, it, expect } from 'vitest';
import { StatsStore } from '../src/stats-store.js';

const MINUTE = 60_000;

function makeStore(startAt: number): { store: StatsStore; advanceTo: (t: number) => void } {
  let now = startAt;
  const store = new StatsStore(() => now);
  return { store, advanceTo: (t: number) => { now = t; } };
}

describe('StatsStore', () => {
  it('starts empty', () => {
    const { store } = makeStore(1_000_000);
    const snap = store.snapshot();
    expect(snap.total).toBe(0);
    expect(snap.recent).toEqual([]);
    expect(snap.perMinute).toEqual([]);
    expect(snap.byStage.delivery).toBe(0);
    expect(snap.bySurface.billboard).toBe(0);
    expect(snap.startedAt).toBe(1_000_000);
  });

  it('records a block with stage, surface, endpoint and stamped time', () => {
    const { store } = makeStore(5_000_000);
    const ev = store.record({ stage: 'delivery', surface: 'sponsorBreak', endpoint: '/api/ad/impression' });
    expect(ev.at).toBe(5_000_000);
    const snap = store.snapshot();
    expect(snap.total).toBe(1);
    expect(snap.byStage.delivery).toBe(1);
    expect(snap.bySurface.sponsorBreak).toBe(1);
    expect(snap.byEndpoint['/api/ad/impression']).toBe(1);
    expect(snap.recent[0]).toEqual(ev);
  });

  it('aggregates multiple stages and endpoints', () => {
    const { store } = makeStore(0);
    store.record({ stage: 'policy', surface: 'sponsorBreak', endpoint: '/api/ad/policy' });
    store.record({ stage: 'policy', surface: 'sponsorBreak', endpoint: '/api/ad/policy' });
    store.record({ stage: 'media', surface: 'billboard', endpoint: '/api/ads/first-party/creative-image/' });
    const snap = store.snapshot();
    expect(snap.total).toBe(3);
    expect(snap.byStage.policy).toBe(2);
    expect(snap.byStage.media).toBe(1);
    expect(snap.byEndpoint['/api/ad/policy']).toBe(2);
  });

  it('keeps recent events newest first and caps at 20', () => {
    const { store, advanceTo } = makeStore(0);
    for (let i = 1; i <= 25; i++) {
      advanceTo(i);
      store.record({ stage: 'inventory', surface: 'partner', endpoint: '/api/ad/partner' });
    }
    const snap = store.snapshot();
    expect(snap.recent).toHaveLength(20);
    expect(snap.recent[0]?.at).toBe(25);
    expect(snap.recent[19]?.at).toBe(6);
    expect(snap.total).toBe(25);
  });

  it('buckets events per minute and prunes buckets older than 30 minutes', () => {
    const t0 = 40 * MINUTE; // minute 40
    const { store, advanceTo } = makeStore(t0);
    store.record({ stage: 'inventory', surface: 'billboard', endpoint: '/api/ad/billboard' });
    store.record({ stage: 'inventory', surface: 'billboard', endpoint: '/api/ad/billboard' });
    advanceTo(t0 + MINUTE);
    store.record({ stage: 'bid', surface: 'showcase', endpoint: '/api/ad/proposal' });

    let snap = store.snapshot();
    expect(snap.perMinute).toEqual([
      { minute: 40, count: 2 },
      { minute: 41, count: 1 },
    ]);

    advanceTo(t0 + 35 * MINUTE);
    store.record({ stage: 'delivery', surface: 'sponsorBreak', endpoint: '/api/ad/impression' });
    snap = store.snapshot();
    expect(snap.perMinute).toEqual([{ minute: 75, count: 1 }]);
  });

  it('snapshot is a copy: external mutation cannot reach the store', () => {
    const { store } = makeStore(0);
    store.record({ stage: 'delivery', surface: 'sponsorBreak', endpoint: '/api/ad/click' });
    const snap = store.snapshot();
    snap.total = 999;
    snap.byStage.delivery = 999;
    snap.recent.pop();
    const fresh = store.snapshot();
    expect(fresh.total).toBe(1);
    expect(fresh.byStage.delivery).toBe(1);
    expect(fresh.recent).toHaveLength(1);
  });

  it('reset clears counters, buckets and events', () => {
    const { store, advanceTo } = makeStore(100);
    store.record({ stage: 'promo', surface: 'invitation', endpoint: '/api/ad/invitation/click' });
    advanceTo(200);
    store.reset();
    const snap = store.snapshot();
    expect(snap.total).toBe(0);
    expect(snap.recent).toEqual([]);
    expect(snap.perMinute).toEqual([]);
    expect(snap.startedAt).toBe(200);
  });
});
