/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activate, deactivate, getStats, getShieldSnapshot, getGhostReport } from '../src/bootstrap.js';
import { RuntimeVerifier } from '../src/runtime-verifier.js';

function tmpConfig(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fb-boot-'));
}

function fakeSession(): any {
  let captured: ((details: unknown, cb: (r: unknown) => void) => void) | null = null;
  const session = {
    defaultSession: {
      webRequest: {
        onBeforeRequest: (_filter: unknown, listener: unknown) => { captured = listener as any; },
      },
    },
  };
  return { session, captured: () => captured };
}

describe('bootstrap extra', () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpConfig();
    process.env.FREEBUFF_CONFIG_DIR = dir;
  });

  afterEach(() => {
    deactivate();
    delete process.env.FREEBUFF_CONFIG_DIR;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('getters return null before activation', () => {
    expect(getStats()).toBeNull();
    expect(getShieldSnapshot()).toBeNull();
    expect(getGhostReport()).toBeNull();
  });

  it('refuses to activate after a crash loop', () => {
    fs.writeFileSync(path.join(dir, 'crash-count'), '3');
    const { session } = fakeSession();
    expect(activate(session, undefined)).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'crash-count'), 'utf8')).toBe('0');
  });

  it('activates without a session object', () => {
    expect(activate(undefined, undefined)).toBe(true);
    expect(getGhostReport()).not.toBeNull();
    expect(getStats()).not.toBeNull();
    expect(getShieldSnapshot()).not.toBeNull();
  });

  it('applies user-generated rules from the config dir', () => {
    fs.writeFileSync(
      path.join(dir, 'generated-rules.json'),
      JSON.stringify({ addEndpoints: ['/api/ad/custom-test'], addSelectors: {}, source: 'user' }),
    );
    const { session, captured } = fakeSession();
    expect(activate(session, undefined)).toBe(true);
    const listener = captured();
    expect(listener).not.toBeNull();
    let result: unknown = null;
    listener!({ url: 'https://freebuff.com/api/ad/custom-test', method: 'GET' }, (r: unknown) => { result = r; });
    expect(result).toEqual({ cancel: true });
  });

  it('applies feed-synced rules from the config dir', () => {
    fs.writeFileSync(
      path.join(dir, 'feed-rules.json'),
      JSON.stringify({ addHosts: ['ads.example.com'], addEndpoints: [], addSelectors: {}, source: 'feed' }),
    );
    const { session, captured } = fakeSession();
    expect(activate(session, undefined)).toBe(true);
    const listener = captured();
    let result: unknown = null;
    listener!({ url: 'https://ads.example.com/api/ad/break', method: 'GET' }, (r: unknown) => { result = r; });
    expect(result).toEqual({ cancel: true });
  });

  it('starts the verify service when enabled', async () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ verify: { enabled: true, port: 0 } }),
    );
    const { session } = fakeSession();
    expect(activate(session, undefined)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const tokenFile = path.join(dir, 'verify.json');
    expect(fs.existsSync(tokenFile)).toBe(true);
    const stored = JSON.parse(fs.readFileSync(tokenFile, 'utf8')) as { token: string; port: number };
    expect(stored.token).toBeTruthy();
    expect(stored.port).toBeGreaterThan(0);
  });

  it('arms the boot verification timer and clears it on deactivate', async () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ verify: { runOnBoot: true, settleMs: 5, timeoutMs: 20, probeRoutes: [], controlRoutes: [] } }),
    );
    const { session } = fakeSession();
    expect(activate(session, undefined)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    deactivate();
    // A second deactivate is a no-op and must not throw.
    expect(() => { deactivate(); }).not.toThrow();
  });

  it('tolerates an app that refuses the will-quit hook', () => {
    const { session } = fakeSession();
    const app = {
      whenReady: () => Promise.resolve(),
      on: (event: string) => { if (event === 'will-quit') throw new Error('nope'); },
      removeListener: () => undefined,
    };
    expect(activate(session, { app })).toBe(true);
  });

  it('survives a config file that disappears before activation', () => {
    const { session } = fakeSession();
    expect(activate(session, undefined)).toBe(true);
    fs.rmSync(path.join(dir, 'config.json'), { force: true });
    expect(() => activate(session, undefined)).not.toThrow();
  });

  it('rolls back promoted rules when the boot verification misses a control', async () => {
    fs.writeFileSync(
      path.join(dir, 'config.json'),
      JSON.stringify({ verify: { runOnBoot: true, settleMs: 5, timeoutMs: 20, probeRoutes: [], controlRoutes: [] } }),
    );
    fs.writeFileSync(
      path.join(dir, 'rules.prev.json'),
      JSON.stringify({ version: 1, endpoints: ['/api/ad/rolled-back'], hosts: [], selectors: {}, source: 'prev', hash: 'h' }),
    );
    const run = vi.spyOn(RuntimeVerifier.prototype, 'run').mockResolvedValue({
      pass: false, reason: 'control-not-reached', targets: 0, probes: [], at: Date.now(),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { session } = fakeSession();
    expect(activate(session, undefined)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(run).toHaveBeenCalled();
    expect(warn.mock.calls.some((call) => String(call[0]).includes('rolled back promoted rules'))).toBe(true);
    run.mockRestore();
    warn.mockRestore();
  });
});
