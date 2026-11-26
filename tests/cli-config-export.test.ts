import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli.js';
import { loadConfig, saveConfig, getConfigPath } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { Config } from '../src/config.js';

const oldDir = process.env.FREEBUFF_CONFIG_DIR;
const oldProfile = process.env.FREEBUFF_PROFILE;
let dir: string;
let outDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-config-export-'));
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-config-out-'));
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

const out = (name = 'export.json') => path.join(outDir, name);
const expected = (cfg: Config): Record<string, unknown> => {
  const copy = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
  const feed = copy.feed as Record<string, unknown>;
  delete feed.publicKey;
  delete feed.previousPublicKey;
  return copy;
};

function saveProfile(profile: string, patch: Partial<Config>): void {
  const profileDir = path.join(dir, 'profiles', profile);
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, 'config.json'),
    JSON.stringify({ ...DEFAULT_CONFIG, ...patch }, null, 2),
  );
}

describe('config-export CLI', () => {
  it('writes the resolved config without the feed trust-root keys', () => {
    saveConfig({ ...DEFAULT_CONFIG, logLevel: 'warn', domRemoval: true });
    const target = out();
    expect(runCli(['config-export', '--out', target])).toBe(0);
    const written = JSON.parse(fs.readFileSync(target, 'utf8')) as Record<string, unknown>;
    expect(written).toEqual(expected(loadConfig()));
    expect(written.logLevel).toBe('warn');
    const feed = written.feed as Record<string, unknown>;
    expect(feed).not.toHaveProperty('publicKey');
    expect(feed).not.toHaveProperty('previousPublicKey');
  });

  it('does not mutate the live config file', () => {
    saveConfig({ ...DEFAULT_CONFIG, logLevel: 'debug' });
    const before = fs.readFileSync(getConfigPath(), 'utf8');
    expect(runCli(['config-export', '--out', out()])).toBe(0);
    expect(fs.readFileSync(getConfigPath(), 'utf8')).toBe(before);
  });

  it('uses an explicit profile over the ambient one', () => {
    saveProfile('work', { logLevel: 'error' });
    saveProfile('dev', { logLevel: 'debug' });
    process.env.FREEBUFF_PROFILE = 'work';
    expect(runCli(['config-export', '--out', out(), '--profile', 'dev'])).toBe(0);
    expect((JSON.parse(fs.readFileSync(out(), 'utf8')) as { logLevel: string }).logLevel).toBe('debug');
  });

  it('uses the ambient profile when --profile is omitted', () => {
    saveProfile('work', { logLevel: 'error' });
    process.env.FREEBUFF_PROFILE = 'work';
    expect(runCli(['config-export', '--out', out()])).toBe(0);
    expect((JSON.parse(fs.readFileSync(out(), 'utf8')) as { logLevel: string }).logLevel).toBe('error');
  });

  it('rejects hostile or invalid profile names', () => {
    saveConfig(DEFAULT_CONFIG);
    for (const profile of ['../escape', 'nested/name', 'back\\slash', '..', '', 'has space', 'UPPER']) {
      const target = out(`bad-${profile.replace(/\W/g, '_')}.json`);
      expect(runCli(['config-export', '--out', target, '--profile', profile]), profile).toBe(2);
      expect(fs.existsSync(target), profile).toBe(false);
    }
  });

  it('rejects bare --profile and --out flags', () => {
    saveConfig(DEFAULT_CONFIG);
    expect(runCli(['config-export', '--out', out(), '--profile'])).toBe(2);
    expect(runCli(['config-export', '--out'])).toBe(2);
    expect(runCli(['config-export'])).toBe(2);
  });

  it('refuses to clobber the live config via direct or aliased paths', () => {
    saveConfig(DEFAULT_CONFIG);
    const before = fs.readFileSync(getConfigPath(), 'utf8');
    expect(runCli(['config-export', '--out', getConfigPath()])).toBe(2);
    const alias = path.join(dir, 'sub', '..', 'config.json');
    expect(runCli(['config-export', '--out', alias])).toBe(2);
    expect(fs.existsSync(path.join(dir, 'sub'))).toBe(false);
    expect(fs.readFileSync(getConfigPath(), 'utf8')).toBe(before);
  });

  it('does not create config.json for a missing profile', () => {
    saveConfig(DEFAULT_CONFIG);
    expect(runCli(['config-export', '--out', out(), '--profile', 'dev'])).toBe(2);
    expect(fs.existsSync(path.join(dir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'profiles', 'dev', 'config.json'))).toBe(false);
    expect(fs.existsSync(out())).toBe(false);
  });

  it('lists the command in help and rejects import', () => {
    runCli(['help']);
    expect(vi.mocked(console.log).mock.calls.flat().join(' ')).toMatch(/config-export\s+--out\s+FILE\s+\[--profile\s+ID\]/);
    expect(runCli(['config-import', '--file', out()])).toBe(2);
  });
});
