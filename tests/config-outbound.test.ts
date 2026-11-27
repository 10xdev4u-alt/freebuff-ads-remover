import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, getConfigPath } from '../src/config.js';
import { runCli } from '../src/cli.js';
import { DEFAULT_CONFIG } from '../src/types.js';

const oldDir = process.env.FREEBUFF_CONFIG_DIR;
const oldProfile = process.env.FREEBUFF_PROFILE;
let dir: string;
let outDir: string;

const loaded = () => loadConfig() as unknown as Record<string, unknown>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-outbound-'));
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-outbound-out-'));
  process.env.FREEBUFF_CONFIG_DIR = dir;
  delete process.env.FREEBUFF_PROFILE;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (oldDir === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
  else process.env.FREEBUFF_CONFIG_DIR = oldDir;
  if (oldProfile === undefined) delete process.env.FREEBUFF_PROFILE;
  else process.env.FREEBUFF_PROFILE = oldProfile;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(outDir, { recursive: true, force: true });
});

describe('outbound config section', () => {
  it('preserves an explicit stored outbound section', () => {
    const outbound = { enabled: true, submitUrl: 'https://collector.example/out', maxBatch: 25 };
    fs.writeFileSync(getConfigPath(), JSON.stringify({ outbound }, null, 2));
    expect(loaded().outbound).toEqual(outbound);

    fs.writeFileSync(getConfigPath(), JSON.stringify({ outbound: { enabled: true } }));
    expect(loaded().outbound).toEqual({ enabled: true, submitUrl: '', maxBatch: 100 });
  });

  it('uses defaults from an empty config file', () => {
    fs.writeFileSync(getConfigPath(), '{}');
    expect(loaded().outbound).toEqual(DEFAULT_CONFIG.outbound);
  });

  it('uses defaults when no config file exists', () => {
    expect(loaded().outbound).toEqual(DEFAULT_CONFIG.outbound);
  });

  it('includes outbound in config-export while still omitting feed keys', () => {
    const outbound = { enabled: true, submitUrl: 'https://collector.example/out', maxBatch: 25 };
    fs.writeFileSync(getConfigPath(), JSON.stringify({ outbound }, null, 2));
    const target = path.join(outDir, 'export.json');
    expect(runCli(['config-export', '--out', target])).toBe(0);
    const exported = JSON.parse(fs.readFileSync(target, 'utf8')) as Record<string, unknown>;
    expect(exported.outbound).toEqual(outbound);
    const feed = exported.feed as Record<string, unknown>;
    expect(feed).not.toHaveProperty('publicKey');
    expect(feed).not.toHaveProperty('previousPublicKey');
  });

  it('fails closed on an invalid outbound value', () => {
    fs.writeFileSync(getConfigPath(), JSON.stringify({ enabled: false, logLevel: 'debug', outbound: { enabled: 'yes' } }));
    const cfg = loaded();
    expect(cfg.enabled).toBe(true);
    expect(cfg.logLevel).toBe('info');
    expect(cfg.outbound).toEqual(DEFAULT_CONFIG.outbound);
  });
});
