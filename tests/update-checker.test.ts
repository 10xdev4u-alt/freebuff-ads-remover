import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkForUpdates, getCurrentVersion } from '../src/update-checker.js';

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns update info when newer version exists', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v1.1.0', html_url: 'https://github.com/test/releases/v1.1.0' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await checkForUpdates('1.0.0');
    expect(result).not.toBeNull();
    expect(result!.latestVersion).toBe('1.1.0');
    expect(result!.updateAvailable).toBe(true);
  });

  it('returns no update when versions match', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v1.0.0', html_url: 'https://github.com/test/releases/v1.0.0' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await checkForUpdates('1.0.0');
    expect(result).not.toBeNull();
    expect(result!.updateAvailable).toBe(false);
  });

  it('returns null on network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await checkForUpdates('1.0.0');
    expect(result).toBeNull();
  });

  it('returns null on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', mockFetch);

    const result = await checkForUpdates('1.0.0');
    expect(result).toBeNull();
  });
});

describe('getCurrentVersion', () => {
  it('returns a version string', () => {
    const version = getCurrentVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });
});
