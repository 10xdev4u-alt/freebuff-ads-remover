import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-cfg-'));
  process.env.FREEBUFF_CONFIG_DIR = dir;
});

afterEach(() => {
  delete process.env.FREEBUFF_CONFIG_DIR;
});

describe('loadConfig presets', () => {
  it('applies the balanced preset, which carries no surface overrides', () => {
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ preset: 'balanced' }));
    const config = loadConfig();
    expect(config.preset).toBe('balanced');
    expect(config.blockTracking).toBe(true);
  });

  it('applies the minimal preset surface overrides', () => {
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ preset: 'minimal' }));
    const config = loadConfig();
    expect(config.surfaces.intermission).toBe(false);
    expect(config.surfaces.sponsorBreak).toBe(true);
  });

  it('keeps parsed surfaces when the preset defines none', () => {
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ preset: 'balanced', surfaces: { billboard: false } }));
    const config = loadConfig();
    expect(config.surfaces.billboard).toBe(false);
    expect(config.surfaces.sponsorBreak).toBe(true);
  });
});
