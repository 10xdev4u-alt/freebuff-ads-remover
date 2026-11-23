import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Logger } from '../src/logger.js';

const realHome = process.env.HOME;

afterEach(() => {
  vi.restoreAllMocks();
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
});

function tempHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-log-'));
  process.env.HOME = home;
  return home;
}

describe('logger formatting and file sink', () => {
  it('formats every argument type', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger('info', false);

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    logger.info(
      'args',
      'text',
      1,
      true,
      2n,
      undefined,
      Symbol('named'),
      function namedFn() { return 1; },
      function () { return 1; },
      new Error('boom'),
      { ok: 1 },
      circular,
      null,
    );

    const line = String(out.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('text');
    expect(line).toContain('1');
    expect(line).toContain('true');
    expect(line).toContain('2');
    expect(line).toContain('undefined');
    expect(line).toContain('named');
    expect(line).toContain('[function namedFn]');
    expect(line).toContain('[function]');
    expect(line).toContain('Error: boom');
    expect(line).toContain('{"ok":1}');
    expect(line).toContain('[unserializable]');
    expect(line).toContain('[unknown]');
  });

  it('omits the argument suffix when no arguments are passed', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    new Logger('info', false).info('plain');
    expect(String(out.mock.calls[0]?.[0])).toMatch(/\[INFO\] plain$/);
  });

  it('respects setLevel and setLogToFile', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new Logger('error', false);
    logger.debug('hidden');
    logger.warn('hidden too');
    expect(out).not.toHaveBeenCalled();

    logger.setLevel('debug');
    logger.info('shown');
    expect(out).toHaveBeenCalledTimes(1);

    logger.setLogToFile(true);
    expect(logger.getLogPath()).toContain('extension.log');
  });

  it('creates the log directory and appends when it does not exist', () => {
    const home = tempHome();
    const logger = new Logger('info', true);
    logger.info('file line');

    const file = logger.getLogPath();
    expect(file).toContain(home);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toContain('[INFO] file line');
  });

  it('swallows a failing file write', () => {
    tempHome();
    const dir = path.join(process.env.HOME as string, '.config', 'freebuff-ads-remover');
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'extension.log'));
    const logger = new Logger('info', true);
    expect(() => { logger.info('never written'); }).not.toThrow();
  });
});
