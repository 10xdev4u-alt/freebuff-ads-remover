import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { submitOutcomes } from '../src/outcome-report.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-out-'));
  process.env.FREEBUFF_CONFIG_DIR = dir;
});

afterEach(() => {
  delete process.env.FREEBUFF_CONFIG_DIR;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function logPath(): string {
  return path.join(dir, 'outcomes.jsonl');
}

function envelope(route: string): string {
  return JSON.stringify({ v: 1, at: 1, healHash: 'h', route, suppressed: true });
}

describe('submitOutcomes', () => {
  it('returns 204 when the log is missing', async () => {
    const result = await submitOutcomes('https://example.com/outcomes', 10);
    expect(result).toEqual({ submitted: 0, status: 204 });
  });

  it('returns 204 when the log has no entries', async () => {
    fs.writeFileSync(logPath(), '\n\n');
    const result = await submitOutcomes('https://example.com/outcomes', 10);
    expect(result).toEqual({ submitted: 0, status: 204 });
  });

  it('submits the last batch and keeps the remainder', async () => {
    fs.writeFileSync(logPath(), `${envelope('/api/ad/a')}\n${envelope('/api/ad/b')}\n`);
    const fetchMock = vi.fn((_url: string, _init?: { body?: string }) => Promise.resolve({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await submitOutcomes('https://example.com/outcomes', 1);
    expect(result).toEqual({ submitted: 1, status: 200 });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { envelopes: { route: string }[] };
    expect(body.envelopes).toEqual([{ v: 1, at: 1, healHash: 'h', route: '/api/ad/b', suppressed: true }]);
    expect(fs.readFileSync(logPath(), 'utf8')).toBe(`${envelope('/api/ad/a')}\n`);
  });

  it('empties the log when the batch covers every line', async () => {
    fs.writeFileSync(logPath(), `${envelope('/api/ad/a')}\n`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await submitOutcomes('https://example.com/outcomes', 5);
    expect(result).toEqual({ submitted: 1, status: 200 });
    expect(fs.readFileSync(logPath(), 'utf8')).toBe('');
  });

  it('keeps the log when the submit fails', async () => {
    fs.writeFileSync(logPath(), `${envelope('/api/ad/a')}\n`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await submitOutcomes('https://example.com/outcomes', 5);
    expect(result).toEqual({ submitted: 1, status: 500 });
    expect(fs.readFileSync(logPath(), 'utf8')).toBe(`${envelope('/api/ad/a')}\n`);
  });
});
