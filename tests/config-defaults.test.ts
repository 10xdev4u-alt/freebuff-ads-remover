import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getConfigDir, getConfigPath, loadConfig, saveConfig, watchConfig } from '../src/config.js';

const oldDir = process.env.FREEBUFF_CONFIG_DIR;
const oldProfile = process.env.FREEBUFF_PROFILE;

afterEach(() => {
  if (oldDir === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
  else process.env.FREEBUFF_CONFIG_DIR = oldDir;
  if (oldProfile === undefined) delete process.env.FREEBUFF_PROFILE;
  else process.env.FREEBUFF_PROFILE = oldProfile;
});

describe('config defaults', () => {
  it('fills every default when the file is empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
    process.env.FREEBUFF_CONFIG_DIR = dir;
    fs.writeFileSync(path.join(dir, 'config.json'), '{}');

    const cfg = loadConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.adHosts).toEqual([]);
    expect(cfg.network.partitionPattern).toBe('^freebuff-');
    expect(cfg.verify).toMatchObject({
      enabled: false,
      port: 0,
      runOnBoot: false,
      settleMs: 8000,
      timeoutMs: 30000,
      concurrency: 8,
      orchestratorOrigin: 'http://127.0.0.1:5174',
    });
    expect(cfg.verify.probeRoutes).toContain('/api/ad/policy');
    expect(cfg.verify.controlRoutes).toEqual(['/healthz', '/api/account/usage']);
    expect(cfg.shadow).toMatchObject({
      enabled: false,
      dryRun: false,
      captureDir: '',
      maxFileBytes: 8388608,
      maxFiles: 5,
      sampleRate: 1.0,
      scrubQuery: true,
      captureControls: true,
      recallFloor: 0.99,
      precisionFloor: 1.0,
    });
    expect(cfg.shield).toMatchObject({ autoHeal: false, promoteAfter: 5, rollbackOnFailure: true, maxPromotedRules: 10 });
    expect(cfg.feed).toMatchObject({ enabled: true, killSwitch: false, maxRules: 25 });
    expect(cfg.feed.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(cfg.feed.previousPublicKey).toContain('BEGIN PUBLIC KEY');
    expect(cfg.inbound).toMatchObject({ enabled: false, submitUrl: '', maxBatch: 100, retentionDays: 7 });
    expect(cfg.ghost).toMatchObject({ enabled: false, preset: 'standard' });
    expect(Object.values(cfg.surfaces).every((v) => v)).toBe(true);
    expect(cfg.logLevel).toBe('info');
    expect(cfg.logToFile).toBe(true);
  });

  it('applies a preset and merges per-surface overrides', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-preset-'));
    process.env.FREEBUFF_CONFIG_DIR = dir;
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ preset: 'minimal', surfaces: { billboard: true } }),
    );

    const cfg = loadConfig();
    expect(cfg.blockTracking).toBe(false);
    expect(cfg.cssFallback).toBe(false);
    expect(cfg.domRemoval).toBe(false);
    expect(cfg.surfaces.billboard).toBe(true);
    expect(cfg.surfaces.intermission).toBe(false);
    expect(cfg.surfaces.sponsorBreak).toBe(true);
  });

  it('returns defaults when the file is unreadable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-bad-'));
    process.env.FREEBUFF_CONFIG_DIR = dir;
    fs.writeFileSync(path.join(dir, 'config.json'), '{broken');
    expect(loadConfig().enabled).toBe(true);
  });

  it('creates a default config when none exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-new-'));
    process.env.FREEBUFF_CONFIG_DIR = dir;
    const cfg = loadConfig();
    expect(cfg.enabled).toBe(true);
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(true);
  });
});

describe('config paths', () => {
  it('honours FREEBUFF_CONFIG_DIR and FREEBUFF_PROFILE', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-base-'));
    process.env.FREEBUFF_CONFIG_DIR = base;
    delete process.env.FREEBUFF_PROFILE;
    expect(getConfigDir()).toBe(base);
    expect(getConfigPath()).toBe(path.join(base, 'config.json'));

    process.env.FREEBUFF_PROFILE = 'work';
    expect(getConfigDir()).toBe(path.join(base, 'profiles', 'work'));
    expect(getConfigDir('default')).toBe(base);
  });
});

describe('watchConfig', () => {
  it('creates the directory and fires on a config.json change', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-watch-')), 'nested');
    process.env.FREEBUFF_CONFIG_DIR = dir;
    delete process.env.FREEBUFF_PROFILE;

    const seen: string[] = [];
    const unwatch = watchConfig((cfg) => seen.push(cfg.logLevel));
    expect(fs.existsSync(dir)).toBe(true);

    saveConfig(loadConfig());
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ logLevel: 'debug' }));

    await new Promise((resolve) => setTimeout(resolve, 300));
    unwatch();
    expect(seen).toContain('debug');
  }, 5000);
});
