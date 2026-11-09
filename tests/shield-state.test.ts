import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { ShieldStateStore } from '../src/shield-state.js';

describe('shield state', () => {
  it('debounces observe writes until flush', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-shield-'));
    const statePath = path.join(tmp, 'shield-state.json');
    const store = new ShieldStateStore(statePath);
    const spy = vi.spyOn(fs, 'writeFileSync');
    store.observe('route:/api/ad/x');
    expect(fs.existsSync(statePath)).toBe(false);
    store.flush();
    expect(fs.existsSync(statePath)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { observations: Record<string, { count: number }> };
    expect(saved.observations['route:/api/ad/x']?.count).toBe(1);
    spy.mockRestore();
  });

  it('save writes immediately', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-shield-'));
    const statePath = path.join(tmp, 'shield-state.json');
    const store = new ShieldStateStore(statePath);
    store.beginLaunch();
    expect(fs.existsSync(statePath)).toBe(true);
  });
});
