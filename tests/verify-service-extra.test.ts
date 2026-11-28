/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, vi } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startVerifyService } from '../src/verify-service.js';
import { BlockLog } from '../src/block-log.js';

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function get(port: number, url: string, init?: RequestInit): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${url}`, init);
}

function rawRequest(port: number, url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: url, headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => { resolve({ status: res.statusCode ?? 0, body }); });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('verify-service endpoints', () => {
  it('returns null when disabled', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = { run: vi.fn(), getLastReport: vi.fn() } as any;
    const dir = tmp('vs-off-');
    const h = await startVerifyService({ enabled: false, port: 0, tokenPath: path.join(dir, 'verify.json') }, verifier, logger, '1.0.0');
    expect(h).toBeNull();
  });

  it('serves health, auth, report, verify and export', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const report = { pass: true, probes: [], reason: undefined };
    const verifier = {
      run: vi.fn().mockResolvedValue(report),
      getLastReport: vi.fn().mockReturnValue(report),
    } as any;
    const dir = tmp('vs-on-');
    const blockLog = new BlockLog(path.join(dir, 'block.jsonl'));
    blockLog.append({ v: 1, at: 1, stage: 'policy', surface: 'sponsorBreak', endpoint: '/api/ad/policy', session: 'default' });

    const h = await startVerifyService({ enabled: true, port: 0, tokenPath: path.join(dir, 'verify.json') }, verifier, logger, '9.9.9', blockLog);
    expect(h).not.toBeNull();
    const port = h?.port as number;
    expect(port).toBeGreaterThan(0);

    const health = await get(port, '/health');
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, version: '9.9.9', appVersion: '9.9.9' });

    const unauth = await get(port, '/report');
    expect(unauth.status).toBe(401);

    const forbidden = await rawRequest(port, '/health', { host: 'evil.example.com' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toBe('forbidden');

    const rep = await get(port, '/report', { headers: { authorization: `Bearer ${h?.token}` } });
    expect(rep.status).toBe(200);
    expect(await rep.json()).toEqual(report);

    const ver = await get(port, '/verify', { method: 'POST', headers: { authorization: `Bearer ${h?.token}` } });
    expect(ver.status).toBe(200);
    expect(await ver.json()).toEqual(report);

    const expJson = await get(port, '/export?format=json', { headers: { authorization: `Bearer ${h?.token}` } });
    expect(expJson.status).toBe(200);
    expect(expJson.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(await expJson.text())).toHaveLength(1);

    const expCsv = await get(port, '/export?format=csv', { headers: { authorization: `Bearer ${h?.token}` } });
    expect(expCsv.headers.get('content-type')).toBe('text/csv');
    expect(await expCsv.text()).toContain('policy');

    const missing = await get(port, '/nope', { headers: { authorization: `Bearer ${h?.token}` } });
    expect(missing.status).toBe(404);

    await h?.close();
  });

  it('reports no-report-yet and 500 on a failing verifier', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = {
      run: vi.fn().mockRejectedValue(new Error('boom')),
      getLastReport: vi.fn().mockReturnValue(null),
    } as any;
    const dir = tmp('vs-err-');
    const h = await startVerifyService({ enabled: true, port: 0, tokenPath: path.join(dir, 'verify.json') }, verifier, logger, '1.0.0');
    const port = h?.port as number;

    const rep = await get(port, '/report', { headers: { authorization: `Bearer ${h?.token}` } });
    expect(await rep.json()).toEqual({ pass: false, reason: 'no-report-yet' });

    const ver = await get(port, '/verify', { method: 'POST', headers: { authorization: `Bearer ${h?.token}` } });
    expect(ver.status).toBe(500);
    expect(await ver.json()).toMatchObject({ error: 'Error: boom' });

    await h?.close();
  });

  it('returns 503 for export when no block log is configured', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = { run: vi.fn(), getLastReport: vi.fn() } as any;
    const dir = tmp('vs-nolog-');
    const h = await startVerifyService({ enabled: true, port: 0, tokenPath: path.join(dir, 'verify.json') }, verifier, logger, '1.0.0');
    const res = await get(h?.port as number, '/export', { headers: { authorization: `Bearer ${h?.token}` } });
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('no block log');
    await h?.close();
  });

  it('persists the token with the bound port', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = { run: vi.fn(), getLastReport: vi.fn() } as any;
    const dir = tmp('vs-token-');
    const tokenPath = path.join(dir, 'nested', 'verify.json');
    const h = await startVerifyService({ enabled: true, port: 0, tokenPath }, verifier, logger, '1.0.0');
    const stored = JSON.parse(fs.readFileSync(tokenPath, 'utf8')) as { token: string; port: number };
    expect(stored.token).toBe(h?.token);
    expect(stored.port).toBe(h?.port);
    await h?.close();
  });

  it('enforces 0600 on a pre-existing token file', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = { run: vi.fn(), getLastReport: vi.fn() } as any;
    const dir = tmp('vs-mode-');
    const tokenPath = path.join(dir, 'verify.json');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tokenPath, '{}', { mode: 0o644 });
    const h = await startVerifyService({ enabled: true, port: 0, tokenPath }, verifier, logger, '1.0.0');
    expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600);
    await h?.close();
  });

  it('resolves null when the port cannot be bound', async () => {
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
    const verifier = { run: vi.fn(), getLastReport: vi.fn() } as any;
    const dir = tmp('vs-bind-');
    const first = await startVerifyService({ enabled: true, port: 0, tokenPath: path.join(dir, 'a.json') }, verifier, logger, '1.0.0');
    const h = await startVerifyService({ enabled: true, port: first?.port as number, tokenPath: path.join(dir, 'b.json') }, verifier, logger, '1.0.0');
    expect(h).toBeNull();
    await first?.close();
  });
});
