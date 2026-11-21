import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Point config dir to temp
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.env.FREEBUFF_CONFIG_DIR = tmp;

import { createCrashGuard } from '../src/crash-guard.js';

const sentinel = path.join(tmp, 'running.sentinel');
const counter = path.join(tmp, 'crash-count');

function reset(): void {
  fs.rmSync(sentinel, { force: true });
  fs.rmSync(counter, { force: true });
}

describe('crash-guard', () => {
  beforeEach(() => { reset(); });
  afterEach(() => { reset(); });

  it('activates on first run and records the sentinel', () => {
    const g = createCrashGuard();
    expect(g.shouldActivate()).toBe(true);
    g.markRunning();
    expect(fs.existsSync(sentinel)).toBe(true);
    expect(g.count()).toBe(0);
  });

  it('counts exactly one unclean exit per launch', () => {
    const g = createCrashGuard();
    g.markRunning(); // previous launch ended unclean
    expect(g.shouldActivate()).toBe(true);
    expect(g.count()).toBe(1);
    expect(fs.existsSync(sentinel)).toBe(false); // consumed, not double-counted
    expect(createCrashGuard().count()).toBe(1);
  });

  it('refuses on the launch after 3 unclean exits, then retries cleanly', () => {
    const g = createCrashGuard();
    for (let i = 0; i < 3; i++) {
      expect(g.shouldActivate()).toBe(true);
      g.markRunning();
    }
    // Fourth launch sees three unclean exits.
    expect(g.shouldActivate()).toBe(false);
    expect(g.count()).toBe(0);
    // The sentinel was consumed, so the retry is not refused again.
    expect(g.shouldActivate()).toBe(true);
    g.markRunning();
    expect(g.count()).toBe(0);
  });

  it('does not count a sentinel owned by a live process', () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']);
    try {
      fs.writeFileSync(sentinel, String(child.pid));
      const g = createCrashGuard();
      expect(g.shouldActivate()).toBe(true);
      expect(g.count()).toBe(0);
    } finally {
      child.kill();
    }
  });

  it('clean exit clears the sentinel and the count', () => {
    const g = createCrashGuard();
    g.markRunning();
    g.markCleanExit();
    expect(fs.existsSync(sentinel)).toBe(false);
    expect(g.count()).toBe(0);
  });
});
