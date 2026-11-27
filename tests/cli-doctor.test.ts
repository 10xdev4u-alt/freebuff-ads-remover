import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli.js';

const repo = path.resolve(__dirname, '..');

beforeAll(() => {
  if (fs.existsSync(path.join(repo, 'dist', 'bootstrap.js'))) return;
  const npmExecpath = process.env.npm_execpath;
  if (!npmExecpath) throw new Error('dist/bootstrap.js is missing; run npm run build before tests');
  execFileSync(process.execPath, [npmExecpath, 'run', 'build'], { cwd: repo, stdio: 'inherit' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function distLine(): string {
  const line = vi.mocked(console.log).mock.calls
    .map((args) => args.map((arg) => String(arg)).join(' '))
    .find((text) => text.startsWith('dist/bootstrap.js exists:'));
  expect(line).toBeDefined();
  return line ?? '';
}

describe('farbuff doctor', () => {
  it('reports install health independently of the working directory', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const original = process.cwd();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-cwd-'));
    try {
      expect(runCli(['doctor'])).toBe(0);
      const fromRepo = distLine();
      vi.mocked(console.log).mockClear();
      process.chdir(tmp);
      expect(runCli(['doctor'])).toBe(0);
      expect(distLine()).toBe(fromRepo);
      expect(fromRepo).toBe('dist/bootstrap.js exists: true');
    } finally {
      process.chdir(original);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
