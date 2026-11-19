import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger } from '../src/logger.js';

const epipe = (): NodeJS.ErrnoException =>
  Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('routes info to stdout and error to stderr', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    new Logger('info', false).info('hello');
    new Logger('info', false).error('boom');

    expect(out).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(out.mock.calls[0]?.[0])).toContain('[INFO] hello');
    expect(String(err.mock.calls[0]?.[0])).toContain('[ERROR] boom');
  });

  it('does not throw when stdout is closed (EPIPE)', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {
      throw epipe();
    });
    expect(() => { new Logger('info', false).info('hello'); }).not.toThrow();
  });

  it('does not throw when stderr is closed (EPIPE)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw epipe();
    });
    expect(() => { new Logger('info', false).error('boom'); }).not.toThrow();
  });

  it('installs an error sink so an async EPIPE never becomes an uncaught exception', async () => {
    vi.resetModules();
    const before = process.stderr.listenerCount('error');
    const { Logger: FreshLogger } = await import('../src/logger.js');

    new FreshLogger('info', false).info('warm the guard');

    expect(process.stderr.listenerCount('error')).toBe(before + 1);
    expect(() => process.stderr.emit('error', epipe())).not.toThrow();
  });
});
