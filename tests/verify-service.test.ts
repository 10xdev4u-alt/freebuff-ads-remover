import { describe, it, expect, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startVerifyService } from '../src/verify-service.js';

describe('verify-service', () => {
  it('returns null when disabled', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = { run: vi.fn(), getLastReport: vi.fn() } as any;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
    const h = await startVerifyService({ enabled: false, port: 0, tokenPath: path.join(tmp, 'verify.json') }, verifier, logger, '0.0.201');
    expect(h).toBeNull();
  });

  it('serves /health without auth', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = { run: vi.fn().mockResolvedValue({ pass: true, probes: [], targets: 1, at: 1 }), getLastReport: vi.fn() } as any;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
    const tokenPath = path.join(tmp, 'verify.json');
    const h = await startVerifyService({ enabled: true, port: 0, tokenPath }, verifier, logger, '0.0.201');
    expect(h).not.toBeNull();
    const res = await fetch(`http://127.0.0.1:${h!.port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    await h!.close();
  });

  it('requires bearer token for /verify', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = { run: vi.fn().mockResolvedValue({ pass: true, probes: [], targets: 1, at: 1 }), getLastReport: vi.fn() } as any;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-'));
    const tokenPath = path.join(tmp, 'verify.json');
    const h = await startVerifyService({ enabled: true, port: 0, tokenPath }, verifier, logger, '0.0.201');
    const noAuth = await fetch(`http://127.0.0.1:${h!.port}/verify`, { method: 'POST' });
    expect(noAuth.status).toBe(401);
    const authed = await fetch(`http://127.0.0.1:${h!.port}/verify`, { method: 'POST', headers: { authorization: `Bearer ${h!.token}` } });
    expect(authed.status).toBe(200);
    await h!.close();
  });
});
