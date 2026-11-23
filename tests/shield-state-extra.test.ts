import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ShieldStateStore } from '../src/shield-state.js';

function tmp(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'shield-')), 'state.json');
}

describe('ShieldStateStore', () => {
  let file: string;
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shield-dir-'));
    file = path.join(dir, 'state.json');
  });

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('starts from defaults when the file is missing or corrupt', () => {
    const missing = new ShieldStateStore(tmp());
    expect(missing.launchId).toBe('');
    expect(missing.promotedCount()).toBe(0);
    expect(missing.eligible(1)).toEqual([]);

    fs.writeFileSync(file, '{broken');
    const corrupt = new ShieldStateStore(file);
    expect(corrupt.launchId).toBe('');
  });

  it('loads a persisted state', () => {
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      launchId: 'launch-1',
      observations: { '/api/ad/x': { count: 3, firstAt: 1, lastAt: 2, launches: 2, lastLaunchId: 'launch-1' } },
      promoted: [{ route: '/api/ad/x', at: 2 }],
      quarantined: [{ route: '/api/ad/y', at: 3, reason: 'fp' }],
    }));
    const store = new ShieldStateStore(file);
    expect(store.launchId).toBe('launch-1');
    expect(store.launches('/api/ad/x')).toBe(2);
    expect(store.promotedCount()).toBe(1);
    expect(store.isQuarantined('/api/ad/y')).toBe(true);
    expect(store.eligible(2)).toEqual(['/api/ad/x']);
  });

  it('begins a launch, observes and counts launches per id', () => {
    // beginLaunch() stamps the id from the wall clock; fake timers keep two
    // consecutive launches from colliding on the same millisecond in CI.
    vi.useFakeTimers();
    try {
      const store = new ShieldStateStore(file);
      const first = store.beginLaunch();
      expect(store.launchId).toBe(first);
      store.observe('/api/ad/x');
      store.observe('/api/ad/x');
      expect(store.launches('/api/ad/x')).toBe(1);

      vi.advanceTimersByTime(1);
      const second = store.beginLaunch();
      expect(second).not.toBe(first);
      store.observe('/api/ad/x');
      expect(store.launches('/api/ad/x')).toBe(2);
      expect(store.launches('/api/ad/unknown')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honours an explicit launch id and backfills a zero firstAt', () => {
    const store = new ShieldStateStore(file);
    store.observe('/api/ad/x', 'fixed');
    expect(store.launches('/api/ad/x')).toBe(1);
    store.observe('/api/ad/x', 'fixed');
    expect(store.launches('/api/ad/x')).toBe(1);
  });

  it('quarantines once and promotes with a delta hash', () => {
    const store = new ShieldStateStore(file);
    store.quarantine('/api/ad/x', 'false-positive');
    store.quarantine('/api/ad/x', 'again');
    expect(store.isQuarantined('/api/ad/x')).toBe(true);

    store.promote('/api/ad/y', 'hash-1');
    expect(store.promotedCount()).toBe(1);
    expect(store.isQuarantined('/api/ad/y')).toBe(false);
  });

  it('eligible excludes quarantined routes and those below the threshold', () => {
    const store = new ShieldStateStore(file);
    store.observe('/api/ad/hot', 'a');
    store.observe('/api/ad/hot', 'b');
    store.observe('/api/ad/cold', 'a');
    store.quarantine('/api/ad/hot', 'fp');
    expect(store.eligible(2)).toEqual([]);
    expect(store.eligible(1)).toEqual(['/api/ad/cold']);
  });

  it('flush and save write the file; scheduled saves are debounced', async () => {
    const store = new ShieldStateStore(file);
    store.observe('/api/ad/x');
    store.flush();
    expect(fs.existsSync(file)).toBe(true);
    const afterFlush = JSON.parse(fs.readFileSync(file, 'utf8')) as { observations: Record<string, unknown> };
    expect(afterFlush.observations['/api/ad/x']).toBeDefined();

    const scheduled = new ShieldStateStore(file);
    scheduled.observe('/api/ad/y');
    expect(fs.existsSync(file)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 260));
    const afterSchedule = JSON.parse(fs.readFileSync(file, 'utf8')) as { observations: Record<string, unknown> };
    expect(afterSchedule.observations['/api/ad/y']).toBeDefined();
  });

  it('creates a missing directory on save', () => {
    const nested = path.join(dir, 'nested', 'state.json');
    const store = new ShieldStateStore(nested);
    store.save();
    expect(fs.existsSync(nested)).toBe(true);
  });
});
