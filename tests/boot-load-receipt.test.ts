import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { activate, deactivate } from '../src/bootstrap.js';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(process.cwd(), 'scripts', 'check-runtime-load.mjs');

let dir: string;
let originalConfigDir: string | undefined;
let originalProfile: string | undefined;

const fakeSession = {
  defaultSession: {
    webRequest: {
      onBeforeRequest: (_filter: unknown, _listener: unknown) => {},
    },
  },
};

function check(configDir: string, extra: string[] = []) {
  return spawnSync(process.execPath, [script, `--dir=${configDir}`, '--max-age-ms=300000', ...extra], { encoding: 'utf8' });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'far-boot-receipt-'));
  originalConfigDir = process.env.FREEBUFF_CONFIG_DIR;
  originalProfile = process.env.FREEBUFF_PROFILE;
  process.env.FREEBUFF_CONFIG_DIR = dir;
  delete process.env.FREEBUFF_PROFILE;
});

afterEach(() => {
  deactivate();
  if (originalConfigDir === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
  else process.env.FREEBUFF_CONFIG_DIR = originalConfigDir;
  if (originalProfile === undefined) delete process.env.FREEBUFF_PROFILE;
  else process.env.FREEBUFF_PROFILE = originalProfile;
  rmSync(dir, { recursive: true, force: true });
});

describe('boot load receipt', () => {
  it('is written at the success point of activate()', () => {
    expect(activate(fakeSession, undefined)).toBe(true);
    const receipt = JSON.parse(readFileSync(join(dir, 'load-receipt.json'), 'utf8')) as Record<string, unknown>;
    expect(receipt.status).toBe('loaded');
    expect(receipt.pid).toBe(process.pid);
    expect(typeof receipt.at).toBe('string');
    expect(typeof receipt.version).toBe('string');
  });

  it('is cleared by deactivate()', () => {
    activate(fakeSession, undefined);
    expect(existsSync(join(dir, 'load-receipt.json'))).toBe(true);
    deactivate();
    expect(existsSync(join(dir, 'load-receipt.json'))).toBe(false);
  });

  it('is absent when the crash guard refuses to activate', () => {
    writeFileSync(join(dir, 'crash-count'), '3');
    expect(activate(fakeSession, undefined)).toBe(false);
    expect(existsSync(join(dir, 'load-receipt.json'))).toBe(false);
  });

  it('follows the active profile', () => {
    process.env.FREEBUFF_PROFILE = 'work';
    expect(activate(fakeSession, undefined)).toBe(true);
    const profileDir = join(dir, 'profiles', 'work');
    expect(existsSync(join(profileDir, 'load-receipt.json'))).toBe(true);
    expect(existsSync(join(dir, 'load-receipt.json'))).toBe(false);
  });
});

describe('check-runtime-load', () => {
  it('accepts a fresh receipt from this process', () => {
    activate(fakeSession, undefined);
    const r = check(dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('LOAD CONFIRMED');
  });

  it('fails when the receipt is missing', () => {
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no load receipt');
  });

  it('fails on a corrupt receipt', () => {
    writeFileSync(join(dir, 'load-receipt.json'), '{ nope');
    const r = check(dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not valid JSON');
  });

  it('fails when the recorded pid is dead', () => {
    const dead = spawnSync(process.execPath, ['-e', ''], { encoding: 'utf8' });
    writeFileSync(
      join(dir, 'load-receipt.json'),
      JSON.stringify({ status: 'loaded', at: new Date().toISOString(), pid: dead.pid, version: '0.0.0' }),
    );
    // The recorded process has already exited, so the liveness probe must fail.
    const r = check(dir, ['--version=0.0.0']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not running');
  });

  it('fails on a stale receipt', () => {
    const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    writeFileSync(join(dir, 'load-receipt.json'), JSON.stringify({ status: 'loaded', at: old, pid: process.pid, version: '0.0.0' }));
    const r = check(dir, ['--version=0.0.0']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('old');
  });
});
