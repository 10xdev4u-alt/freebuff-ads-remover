import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdInterceptor } from '../src/interceptor.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_CONFIG, AD_ENDPOINTS } from '../src/types.js';
import type { Config } from '../src/config.js';
import { loadConfig, saveConfig } from '../src/config.js';

const UPDATES = 'https://freebuff.com/api/desktop/updates/';
const makeConfig = (blockUpdates: boolean): Config => ({ ...DEFAULT_CONFIG, blockUpdates });
const interceptor = (cfg: Config) => new AdInterceptor(cfg, new Logger('error', false));

const oldDir = process.env.FREEBUFF_CONFIG_DIR;
const oldProfile = process.env.FREEBUFF_PROFILE;
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop()!, { recursive: true, force: true });
  if (oldDir === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
  else process.env.FREEBUFF_CONFIG_DIR = oldDir;
  if (oldProfile === undefined) delete process.env.FREEBUFF_PROFILE;
  else process.env.FREEBUFF_PROFILE = oldProfile;
});

function configDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'block-updates-'));
  dirs.push(dir);
  delete process.env.FREEBUFF_PROFILE;
  process.env.FREEBUFF_CONFIG_DIR = dir;
  return dir;
}

describe('opt-in desktop updates blocking', () => {
  it('is off by default', () => {
    expect(interceptor(DEFAULT_CONFIG).intercept(UPDATES, 'GET').blocked).toBe(false);
    expect(interceptor(makeConfig(false)).intercept(UPDATES, 'GET').blocked).toBe(false);
  });

  it('blocks the updates endpoint when opted in', () => {
    const result = interceptor(makeConfig(true)).intercept(UPDATES, 'GET');
    expect(result.blocked).toBe(true);
    expect(result.endpoint).toContain('/api/desktop/updates');
    expect(result.reason).toContain('blockUpdates');
  });

  it('leaves other first-party paths alone when opted in', () => {
    const i = interceptor(makeConfig(true));
    for (const url of [
      'https://freebuff.com/api/account/usage',
      'https://freebuff.com/api/chat',
      'https://freebuff.com/api/desktop/paid-api',
      'http://127.0.0.1:5174/api/chat',
    ]) {
      expect(i.intercept(url, 'GET').blocked).toBe(false);
    }
  });

  it('does not over-block the sibling updates-check path', () => {
    expect(interceptor(makeConfig(true)).intercept('https://freebuff.com/api/desktop/updates-check', 'GET').blocked).toBe(false);
  });

  it('blocks query, case, duplicate-slash and subpath variants', () => {
    const i = interceptor(makeConfig(true));
    for (const url of [
      `${UPDATES}?channel=stable&platform=linux`,
      'https://freebuff.com/API/Desktop/Updates/',
      'https://freebuff.com/api//desktop/updates/',
      'https://freebuff.com/api/desktop/updates/check',
      'https://freebuff.com/api/desktop/updates',
      'https://freebuff.com/api/%64esktop/updates/',
    ]) {
      expect(i.intercept(url, 'GET').blocked).toBe(true);
    }
  });

  it('never throws on malformed percent-encoding', () => {
    const i = interceptor(makeConfig(true));
    expect(i.intercept('https://freebuff.com/api/%ZZ/updates/', 'GET').blocked).toBe(false);
    expect(i.intercept('https://freebuff.com/api/desktop/updates/%ZZ', 'GET').blocked).toBe(true);
  });

  it('honors runtime config updates', () => {
    const i = interceptor(makeConfig(false));
    expect(i.intercept(UPDATES, 'GET').blocked).toBe(false);
    i.updateConfig(makeConfig(true));
    expect(i.intercept(UPDATES, 'GET').blocked).toBe(true);
    i.updateConfig(makeConfig(false));
    expect(i.intercept(UPDATES, 'GET').blocked).toBe(false);
  });

  it('lets the master switch win', () => {
    expect(interceptor({ ...makeConfig(true), enabled: false }).intercept(UPDATES, 'GET').blocked).toBe(false);
  });

  it('is not affected by blockTracking', () => {
    expect(interceptor({ ...makeConfig(true), blockTracking: false }).intercept(UPDATES, 'GET').blocked).toBe(true);
  });

  it('is reflected by isAdUrl so redirect chains also cancel', () => {
    expect(interceptor(makeConfig(false)).isAdUrl(UPDATES)).toBe(false);
    expect(interceptor(makeConfig(true)).isAdUrl(UPDATES)).toBe(true);
  });

  it('does not add the updates path to AD_ENDPOINTS', () => {
    expect(AD_ENDPOINTS).not.toContain('/api/desktop/updates/');
  });
});

describe('blockUpdates config', () => {
  it('defaults to false and loads an explicit true from disk', () => {
    const dir = configDir();
    fs.writeFileSync(path.join(dir, 'config.json'), '{}');
    expect(DEFAULT_CONFIG.blockUpdates).toBe(false);
    expect(loadConfig().blockUpdates).toBe(false);
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ blockUpdates: true }));
    expect(loadConfig().blockUpdates).toBe(true);
  });

  it('round-trips through saveConfig and survives presets as an explicit opt-in', () => {
    configDir();
    saveConfig(makeConfig(true));
    expect(loadConfig().blockUpdates).toBe(true);
    const cfg = loadConfig();
    expect(cfg.blockUpdates).toBe(true);
  });
});
