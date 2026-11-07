import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Point config dir to temp
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-'));
process.env.FREEBUFF_CONFIG_DIR = tmp;

import { createCrashGuard } from '../src/crash-guard.js';

describe('crash-guard', () => {
  it('activates on first run', () => {
    const g = createCrashGuard();
    expect(g.shouldActivate()).toBe(true);
    g.markRunning();
    expect(fs.existsSync(path.join(tmp, 'running.sentinel'))).toBe(true);
  });

  it('counts unclean exit', () => {
    const g = createCrashGuard();
    // sentinel exists from previous run
    expect(g.shouldActivate()).toBe(true);
    expect(g.count()).toBe(1);
    g.markRunning();
  });

  it('disables after 3 crashes', () => {
    // simulate 3 crashes
    fs.writeFileSync(path.join(tmp, 'crash-count'), '3');
    fs.writeFileSync(path.join(tmp, 'running.sentinel'), '1');
    const g = createCrashGuard();
    expect(g.shouldActivate()).toBe(false);
    expect(g.count()).toBe(0); // reset
  });

  it('clean exit resets', () => {
    const g = createCrashGuard();
    g.markRunning();
    g.markCleanExit();
    expect(fs.existsSync(path.join(tmp, 'running.sentinel'))).toBe(false);
    expect(g.count()).toBe(0);
  });
});
