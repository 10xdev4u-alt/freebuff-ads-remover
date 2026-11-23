import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { checkForUpdates, getCurrentVersion } from '../src/update-checker.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function tmpCwd(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fb-cwd-'));
}

describe('getCurrentVersion fallbacks', () => {
  it('returns 0.0.0 when package.json is missing', () => {
    const cwd = process.cwd();
    const dir = tmpCwd();
    try {
      process.chdir(dir);
      expect(getCurrentVersion()).toBe('0.0.0');
    } finally {
      process.chdir(cwd);
    }
  });

  it('returns 0.0.0 when package.json has no version', () => {
    const cwd = process.cwd();
    const dir = tmpCwd();
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
      process.chdir(dir);
      expect(getCurrentVersion()).toBe('0.0.0');
    } finally {
      process.chdir(cwd);
    }
  });

  it('returns 0.0.0 when package.json is unreadable', () => {
    const cwd = process.cwd();
    const dir = tmpCwd();
    try {
      fs.writeFileSync(path.join(dir, 'package.json'), '{not json');
      process.chdir(dir);
      expect(getCurrentVersion()).toBe('0.0.0');
    } finally {
      process.chdir(cwd);
    }
  });
});

describe('isNewer via checkForUpdates', () => {
  async function check(latest: string, current: string): Promise<boolean> {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: `v${latest}`, html_url: 'https://example.com' }),
    }));
    const info = await checkForUpdates(current);
    return info?.updateAvailable ?? false;
  }

  it('pads the shorter version with zeros', async () => {
    expect(await check('1.0.1', '1.0')).toBe(true);
    expect(await check('1.0', '1.0.1')).toBe(false);
  });

  it('compares equal-length versions', async () => {
    expect(await check('1.2.0', '1.1.9')).toBe(true);
    expect(await check('1.1.9', '1.2.0')).toBe(false);
  });
});
