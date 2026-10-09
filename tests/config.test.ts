import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, getConfigPath, getConfigDir, DEFAULT_CONFIG } from '../src/config.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Logger } from '../src/logger.js';

const testDirs: string[] = [];

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), 'far-test-'));
  testDirs.push(dir);
});

afterEach(() => {
  for (const dir of testDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function useTestHome(dir: string): () => void {
  const originalHome = process.env.HOME;
  process.env.HOME = dir;
  return () => {
    process.env.HOME = originalHome;
  };
}

function writeConfig(dir: string, config: Record<string, unknown>): void {
  const configDir = join(dir, '.config', 'freebuff-ads-remover');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'config.json'), JSON.stringify(config));
}

describe('loadConfig', () => {
  it('returns defaults when no config exists', () => {
    const restore = useTestHome(testDirs[0]!);
    try {
      const config = loadConfig();
      expect(config.enabled).toBe(true);
      expect(config.blockTracking).toBe(true);
      expect(config.cssFallback).toBe(true);
      expect(config.logLevel).toBe('info');
    } finally {
      restore();
    }
  });

  it('loads config from disk', () => {
    const dir = testDirs[0]!;
    writeConfig(dir, { enabled: false, logLevel: 'debug' });
    const restore = useTestHome(dir);
    try {
      const config = loadConfig();
      expect(config.enabled).toBe(false);
      expect(config.logLevel).toBe('debug');
    } finally {
      restore();
    }
  });

  it('falls back to defaults on invalid JSON', () => {
    const dir = testDirs[0]!;
    const configDir = join(dir, '.config', 'freebuff-ads-remover');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), 'not json');
    const restore = useTestHome(dir);
    try {
      const config = loadConfig();
      expect(config.enabled).toBe(true);
      expect(config.surfaces.sponsorBreak).toBe(true);
    } finally {
      restore();
    }
  });

  it('merges partial config with defaults', () => {
    const dir = testDirs[0]!;
    writeConfig(dir, { surfaces: { billboard: false } });
    const restore = useTestHome(dir);
    try {
      const config = loadConfig();
      expect(config.surfaces.billboard).toBe(false);
      expect(config.surfaces.sponsorBreak).toBe(true);
      expect(config.blockTracking).toBe(true);
    } finally {
      restore();
    }
  });
});

describe('saveConfig', () => {
  it('saves config to disk', () => {
    const dir = testDirs[0]!;
    const restore = useTestHome(dir);
    try {
      saveConfig({ ...DEFAULT_CONFIG, enabled: false });
      const config = loadConfig();
      expect(config.enabled).toBe(false);
    } finally {
      restore();
    }
  });
});

describe('getConfigPath', () => {
  it('returns path under .config', () => {
    const path = getConfigPath();
    expect(path).toContain('.config');
    expect(path).toContain('freebuff-ads-remover');
  });
});

describe('getConfigDir', () => {
  it('returns dir under .config', () => {
    const dir = getConfigDir();
    expect(dir).toContain('.config');
    expect(dir).toContain('freebuff-ads-remover');
  });
});

describe('Logger', () => {
  it('creates logger with defaults', () => {
    const logger = new Logger();
    expect(logger).toBeDefined();
  });

  it('respects log level', () => {
    const logger = new Logger('error', false);
    expect(logger).toBeDefined();
  });

  it('returns log path', () => {
    const logger = new Logger('info', false);
    const path = logger.getLogPath();
    expect(path).toContain('extension.log');
  });
});
