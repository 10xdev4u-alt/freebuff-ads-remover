import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = process.cwd();
const script = path.join(repo, 'scripts', 'e2e-headless.mjs');

describe('e2e-headless exit codes', () => {
  it('exits 2 when --appimage is omitted', () => {
    const r = spawnSync(process.execPath, [script], { cwd: repo, encoding: 'utf8' });
    expect(r.status).toBe(2);
  });

  it('exits 0 with --allow-skip', () => {
    const r = spawnSync(process.execPath, [script, '--allow-skip'], { cwd: repo, encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  it('exits 2 for --feed without feed env', () => {
    const r = spawnSync(process.execPath, [script, '--appimage', '/nonexistent.AppImage', '--feed'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, FREEBUFF_FEED_URL: '', FREEBUFF_FEED_PUBLIC_KEY: '' },
    });
    expect(r.status).toBe(2);
  });
});
