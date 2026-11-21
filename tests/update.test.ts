import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// scripts/update.mjs shells out to git/npm, so drive it with stubs on PATH.
const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'scripts', 'update.mjs');

let root: string;
let bin: string;

function writeStub(name: string, body: string): void {
  const p = path.join(bin, name);
  fs.writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  fs.chmodSync(p, 0o755);
}

const GOOD_BUILD = 'if [ "$1" = "run" ] && [ "$2" = "build" ]; then mkdir -p "$FREEBUFF_INSTALL_ROOT/dist"; printf "// freebuff-ads-remover" > "$FREEBUFF_INSTALL_ROOT/dist/bootstrap.js"; fi; exit 0';
const BAD_BUILD = 'if [ "$1" = "run" ] && [ "$2" = "build" ]; then mkdir -p "$FREEBUFF_INSTALL_ROOT/dist"; printf "// no marker" > "$FREEBUFF_INSTALL_ROOT/dist/bootstrap.js"; fi; exit 0';

function run(): { status: number | null; output: string } {
  const r = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, FREEBUFF_INSTALL_ROOT: root, PATH: `${bin}:/usr/bin:/bin` },
  });
  return { status: r.status, output: r.stdout + r.stderr };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-'));
  bin = fs.mkdtempSync(path.join(os.tmpdir(), 'upd-bin-'));
  writeStub('git', 'exit 0');
  writeStub('npm', GOOD_BUILD);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(bin, { recursive: true, force: true });
});

describe('scripts/update.mjs', () => {
  it('restores the previous dist when the marker check fails', () => {
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'bootstrap.js'), 'previous build');
    writeStub('npm', BAD_BUILD);

    const r = run();

    expect(r.status).not.toBe(0);
    expect(fs.readFileSync(path.join(root, 'dist', 'bootstrap.js'), 'utf8')).toBe('previous build');
  });

  it('keeps a working dist and a backup after a good build', () => {
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist', 'bootstrap.js'), 'previous build');

    const r = run();

    expect(r.status).toBe(0);
    expect(fs.readFileSync(path.join(root, 'dist', 'bootstrap.js'), 'utf8')).toContain('freebuff-ads-remover');
    expect(fs.readFileSync(path.join(root, 'dist.bak', 'bootstrap.js'), 'utf8')).toBe('previous build');
  });

  it('fails cleanly when there is no previous build to restore', () => {
    writeStub('npm', BAD_BUILD);
    const r = run();
    expect(r.status).not.toBe(0);
    expect(r.output).toContain('no previous build');
  });
});
