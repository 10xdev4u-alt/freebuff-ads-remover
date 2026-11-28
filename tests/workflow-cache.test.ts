import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '..');
const workflow = path.join(repo, '.github', 'workflows', 'upstream-proof.yml');

describe('upstream-proof AppImage cache', () => {
  it('keeps the cached AppImage through every cleanup step', () => {
    const source = fs.readFileSync(workflow, 'utf8');
    expect(source).toContain('path: freebuff-*.AppImage');
    const cleanups = source.split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('run: rm -rf '))
      .map((line) => line.slice('run: '.length));
    expect(cleanups.length).toBeGreaterThan(0);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-cache-'));
    try {
      fs.writeFileSync(path.join(dir, 'freebuff-0.0.205.AppImage'), 'fake image');
      fs.mkdirSync(path.join(dir, 'squashfs-root'));
      fs.mkdirSync(path.join(dir, '.heal-tmp'));
      for (const command of cleanups) {
        execFileSync('/bin/bash', ['-c', command], { cwd: dir });
      }
      const files = fs.readdirSync(dir);
      expect(files.some((file) => file.endsWith('.AppImage'))).toBe(true);
      expect(files).not.toContain('squashfs-root');
      expect(files).not.toContain('.heal-tmp');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
