import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isMain } from '../scripts/fetch-latest-appimage.mjs';

const repo = path.resolve(__dirname, '..');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetch-latest-appimage self-execution guard', () => {
  it.each([
    {
      name: 'plain path',
      metaUrl: 'file:///opt/farbuff/scripts/fetch-latest-appimage.mjs',
      argv1: '/opt/farbuff/scripts/fetch-latest-appimage.mjs',
      expected: true,
    },
    {
      name: 'path containing a space',
      metaUrl: 'file:///opt/my%20buff/scripts/fetch-latest-appimage.mjs',
      argv1: '/opt/my buff/scripts/fetch-latest-appimage.mjs',
      expected: true,
    },
    {
      name: 'path containing a literal %20 segment',
      metaUrl: 'file:///opt/with%2520literal/scripts/fetch-latest-appimage.mjs',
      argv1: '/opt/with%20literal/scripts/fetch-latest-appimage.mjs',
      expected: true,
    },
    {
      name: 'a different runner path',
      metaUrl: 'file:///opt/farbuff/scripts/fetch-latest-appimage.mjs',
      argv1: '/usr/local/bin/vitest.mjs',
      expected: false,
    },
    {
      name: 'no argv[1]',
      metaUrl: 'file:///opt/farbuff/scripts/fetch-latest-appimage.mjs',
      argv1: undefined,
      expected: false,
    },
  ])('matches $name correctly', ({ metaUrl, argv1, expected }) => {
    expect(isMain(metaUrl, argv1)).toBe(expected);
  });

  it('authenticates every workflow that invokes the AppImage CLI', () => {
    const dir = path.join(repo, '.github', 'workflows');
    const consumers = fs.readdirSync(dir)
      .filter((file) => file.endsWith('.yml'))
      .filter((file) => fs.readFileSync(path.join(dir, file), 'utf8').includes('fetch-latest-appimage.mjs'));
    expect(consumers.length).toBeGreaterThan(0);
    for (const file of consumers) {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      expect(source, file).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    }
  });

  it('does not run main when imported as a library', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: false, status: 599 }));
    vi.stubGlobal('fetch', fetchSpy);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit-forbidden'); });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oldArgv = process.argv;
    process.argv = [oldArgv[0] ?? '', '/usr/local/bin/vitest.mjs', '--version', '0.0.0', '--check'];
    try {
      const probe = '../scripts/fetch-latest-appimage.mjs?main-guard-probe';
      await import(probe);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      process.argv = oldArgv;
    }
  });
});
