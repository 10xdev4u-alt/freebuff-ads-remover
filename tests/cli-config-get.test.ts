import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli.js';
import { loadConfig } from '../src/config.js';

const oldDir = process.env.FREEBUFF_CONFIG_DIR;
const oldProfile = process.env.FREEBUFF_PROFILE;
let ambientDir: string;
let explicitDir: string;
let explicitFile: string;
let emptyDir: string;
let missingFile: string;

function output(): string {
  return String(vi.mocked(console.log).mock.calls.at(-1)?.[0]);
}

beforeEach(() => {
  ambientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-get-ambient-'));
  explicitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-get-explicit-'));
  emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-get-empty-'));
  fs.writeFileSync(path.join(ambientDir, 'config.json'), JSON.stringify({
    logLevel: 'warn', enabled: false,
    feed: { enabled: false, url: 'https://ambient.test/m.json' },
    shadow: { dryRun: true },
  }));
  explicitFile = path.join(explicitDir, 'config.json');
  fs.writeFileSync(explicitFile, JSON.stringify({
    logLevel: 'error', enabled: true,
    feed: {
      enabled: true,
      url: 'https://explicit.test/m.json',
      publicKey: '-----BEGIN PUBLIC KEY-----\nEXPLICIT\n-----END PUBLIC KEY-----',
    },
    outbound: { enabled: true },
    shadow: { dryRun: false },
  }));
  missingFile = path.join(explicitDir, 'absent.json');
  process.env.FREEBUFF_CONFIG_DIR = ambientDir;
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
  for (const dir of [ambientDir, explicitDir, emptyDir]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('config-get for the launcher', () => {
  it('reads a flat key from an explicit --dir file, not the ambient config', () => {
    expect(runCli(['config-get', '--dir', explicitFile, 'logLevel'])).toBe(0);
    expect(output()).toBe('error');
  });

  it('resolves a dotted key from an explicit --dir file', () => {
    expect(runCli(['config-get', '--dir', explicitFile, 'feed.enabled'])).toBe(0);
    expect(output()).toBe('true');
  });

  it('prints string values raw, including embedded newlines', () => {
    expect(runCli(['config-get', '--dir', explicitFile, 'feed.publicKey'])).toBe(0);
    expect(output()).toBe('-----BEGIN PUBLIC KEY-----\nEXPLICIT\n-----END PUBLIC KEY-----');
    vi.mocked(console.log).mockClear();
    expect(runCli(['config-get', '--dir', explicitFile, 'feed.url'])).toBe(0);
    expect(output()).toBe('https://explicit.test/m.json');
  });

  it('resolves dotted keys from an explicit --dir directory', () => {
    expect(runCli(['config-get', '--dir', explicitDir, 'outbound.enabled'])).toBe(0);
    expect(output()).toBe('true');
  });

  it('keeps flat keys from an explicit --dir directory working', () => {
    expect(runCli(['config-get', '--dir', explicitDir, 'logLevel'])).toBe(0);
    expect(output()).toBe('error');
  });

  it('resolves dotted keys against the ambient config without --dir', () => {
    expect(runCli(['config-get', 'shadow.dryRun'])).toBe(0);
    expect(output()).toBe('true');
    vi.mocked(console.log).mockClear();
    expect(runCli(['config-get', 'feed.enabled'])).toBe(0);
    expect(output()).toBe('false');
  });

  it('prints undefined for missing keys and exits 0', () => {
    expect(runCli(['config-get', 'feed.missing'])).toBe(0);
    expect(output()).toBe('undefined');
    vi.mocked(console.log).mockClear();
    expect(runCli(['config-get', '--dir', explicitFile, 'feed.missing'])).toBe(0);
    expect(output()).toBe('undefined');
  });

  it('does not fall back to ambient values when an explicit --dir file is missing', () => {
    expect(runCli(['config-get', '--dir', missingFile, 'logLevel'])).toBe(0);
    expect(output()).toBe('undefined');
  });

  it('does not fall back to ambient values for an empty --dir directory', () => {
    expect(runCli(['config-get', '--dir', emptyDir, 'logLevel'])).toBe(0);
    expect(output()).toBe('undefined');
  });

  it('keeps the legacy output shape for flat and object keys', () => {
    expect(runCli(['config-get', 'logLevel'])).toBe(0);
    expect(output()).toBe('warn');
    vi.mocked(console.log).mockClear();
    expect(runCli(['config-get', 'enabled'])).toBe(0);
    expect(output()).toBe('false');
    vi.mocked(console.log).mockClear();
    expect(runCli(['config-get', 'feed'])).toBe(0);
    expect(output()).toBe(JSON.stringify((loadConfig() as unknown as Record<string, unknown>).feed));
  });
});

describe('launcher CLI entry point', () => {
  it('never calls dist/cli.js directly', () => {
    const launcher = fs.readFileSync(path.join(process.cwd(), 'scripts', 'launch-freebuff.sh'), 'utf8');
    expect(launcher).not.toContain('dist/cli.js');
    expect(launcher).toContain('bin/farbuff.mjs');
  });
});
