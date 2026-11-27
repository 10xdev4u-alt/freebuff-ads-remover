import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runCli } from '../src/cli.js';
import { loadCorpus } from '../src/corpus.js';

const oldLog = console.log;

function output(): string {
  return String(vi.mocked(console.log).mock.calls.at(-1)?.[0]);
}

function expectHashConsistent(report: { ruleVersion: number; ruleHash: string; corpusEntries: number; reportHash: string }): void {
  const canonical = JSON.stringify({
    ruleVersion: report.ruleVersion,
    ruleHash: report.ruleHash,
    corpusEntries: report.corpusEntries,
  });
  expect(report.reportHash).toBe(crypto.createHash('sha256').update(canonical).digest('hex'));
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  expect(console.log).toBe(oldLog);
});

describe('farbuff trust', () => {
  it('reports the real corpus entry count and a matching hash', () => {
    const expected = loadCorpus(path.join(process.cwd(), 'corpus')).entries.length;
    expect(runCli(['trust'])).toBe(0);
    const report = JSON.parse(output()) as {
      ruleVersion: number; ruleHash: string; corpusEntries: number; reportHash: string;
    };
    expect(report.corpusEntries).toBe(expected);
    expectHashConsistent(report);
  });

  it('reads an explicit --dir corpus', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-trust-'));
    try {
      const rows = [
        { path: '/api/ad/banner', label: 'ad', surface: 'billboard' },
        { path: '/healthz', label: 'control' },
      ];
      const lines = rows.map((row) => JSON.stringify(row));
      fs.writeFileSync(path.join(dir, 'golden.jsonl'), lines.join('\n') + '\n');
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
        version: 1,
        freebuffVersion: '0.0.205',
        entries: rows.length,
        ads: 1,
        controls: 1,
        sha256: crypto.createHash('sha256').update(lines.join('\n') + '\n').digest('hex'),
      }));

      expect(runCli(['trust', '--dir', dir])).toBe(0);
      const report = JSON.parse(output()) as {
        ruleVersion: number; ruleHash: string; corpusEntries: number; reportHash: string;
      };
      expect(report.corpusEntries).toBe(2);
      expectHashConsistent(report);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
