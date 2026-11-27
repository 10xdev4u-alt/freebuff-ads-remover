import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli.js';

const oldDir = process.env.FREEBUFF_CONFIG_DIR;
const oldProfile = process.env.FREEBUFF_PROFILE;
const oldHome = process.env.HOME;
let base: string;
let home: string;

const ENTRIES = [
  { v: 1, at: 1000, stage: 'network', surface: 'sponsorBreak', endpoint: '/api/ad/break', session: 'sess-1' },
  { v: 1, at: 2000, stage: 'dom', surface: 'billboard', endpoint: '/api/ad/billboard', session: 'sess-2' },
];
const DECOY = { v: 1, at: 9999, stage: 'decoy', surface: 'decoy', endpoint: '/decoy', session: 'decoy' };
const EXPECTED_JSON = JSON.stringify(ENTRIES);
const EXPECTED_CSV = [
  'v,at,stage,surface,endpoint,session',
  '"1","1000","network","sponsorBreak","/api/ad/break","sess-1"',
  '"1","2000","dom","billboard","/api/ad/billboard","sess-2"',
].join('\n');

function writeLog(dir: string, rows: object[]): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'block-log.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

function output(): string {
  const calls = vi.mocked(console.log).mock.calls;
  expect(calls).toHaveLength(1);
  return String(calls[0]?.[0]);
}

function configureProfile(): void {
  writeLog(base, [DECOY]);
  writeLog(path.join(base, 'profiles', 'work'), ENTRIES);
  process.env.FREEBUFF_PROFILE = 'work';
}

function configureHome(): void {
  delete process.env.FREEBUFF_CONFIG_DIR;
  delete process.env.FREEBUFF_PROFILE;
  process.env.HOME = home;
  writeLog(path.join(home, '.config', 'freebuff-ads-remover'), ENTRIES);
}

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-export-'));
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-export-home-'));
  process.env.FREEBUFF_CONFIG_DIR = base;
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
  if (oldHome === undefined) delete process.env.HOME;
  else process.env.HOME = oldHome;
  fs.rmSync(base, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

describe('farbuff export reads the writer config dir', () => {
  it('reads the profile config dir as JSON', () => {
    configureProfile();
    expect(runCli(['export'])).toBe(0);
    expect(output()).toBe(EXPECTED_JSON);
  });

  it('reads the profile config dir as CSV', () => {
    configureProfile();
    expect(runCli(['export', '--format', 'csv'])).toBe(0);
    expect(output()).toBe(EXPECTED_CSV);
  });

  it('falls back to HOME when the config dir env is unset (JSON)', () => {
    configureHome();
    expect(runCli(['export'])).toBe(0);
    expect(output()).toBe(EXPECTED_JSON);
  });

  it('falls back to HOME when the config dir env is unset (CSV)', () => {
    configureHome();
    expect(runCli(['export', '--format', 'csv'])).toBe(0);
    expect(output()).toBe(EXPECTED_CSV);
  });

  it('keeps the explicit config dir working with no profile (JSON)', () => {
    writeLog(base, ENTRIES);
    expect(runCli(['export'])).toBe(0);
    expect(output()).toBe(EXPECTED_JSON);
  });

  it('keeps the explicit config dir working with no profile (CSV)', () => {
    writeLog(base, ENTRIES);
    expect(runCli(['export', '--format', 'csv'])).toBe(0);
    expect(output()).toBe(EXPECTED_CSV);
  });
});
