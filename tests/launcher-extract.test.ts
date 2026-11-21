import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The launcher is a script, not a module: strip the `main "$@"` call and
// source the rest so extract_appimage can be exercised directly.
const script = join(process.cwd(), 'scripts', 'launch-freebuff.sh');

let root: string;
let bin: string;
let harness: string;

function writeAppImage(body: string): string {
  const p = join(bin, 'fake-appimage');
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
}

function extract(appimage: string, extractDir: string): { status: number | null; stdout: string } {
  const r = spawnSync(
    'bash',
    ['-c', 'source "$1"; extract_appimage "$2" "$3"', '_', harness, appimage, extractDir],
    { encoding: 'utf8' },
  );
  return { status: r.status, stdout: r.stdout };
}

function sha256(file: string): string {
  return spawnSync('sha256sum', [file], { encoding: 'utf8' }).stdout.split(' ')[0] ?? '';
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'far-launch-'));
  bin = mkdtempSync(join(tmpdir(), 'far-launch-bin-'));
  const src = readFileSync(script, 'utf8');
  harness = join(root, 'harness.sh');
  writeFileSync(harness, src.replace(/^main "\$@"\s*$/m, ''));
  chmodSync(harness, 0o755);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(bin, { recursive: true, force: true });
});

describe('launch-freebuff extract_appimage', () => {
  it('caches a complete extraction', () => {
    const appimage = writeAppImage(
      'mkdir -p squashfs-root/resources\n: > squashfs-root/AppRun\n: > squashfs-root/resources/app.asar\nexit 0\n',
    );
    const extractDir = join(root, 'extract');

    const first = extract(appimage, extractDir);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('squashfs-root');
    const stamp = join(extractDir, '.appimage-sha');
    expect(existsSync(stamp)).toBe(true);
    expect(readFileSync(stamp, 'utf8').trim()).toBe(sha256(appimage));

    // A second call must hit the cache rather than re-extract.
    const second = extract(appimage, extractDir);
    expect(second.status).toBe(0);
  });

  it('does not cache an extractor that exits nonzero', () => {
    const appimage = writeAppImage(
      'mkdir -p squashfs-root/resources\n: > squashfs-root/AppRun\n: > squashfs-root/resources/app.asar\nexit 1\n',
    );
    const extractDir = join(root, 'extract');

    const r = extract(appimage, extractDir);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(extractDir, '.appimage-sha'))).toBe(false);
    expect(existsSync(extractDir)).toBe(false);
  });

  it('does not cache an extraction missing the resources tree', () => {
    const appimage = writeAppImage('mkdir -p squashfs-root\n: > squashfs-root/AppRun\nexit 0\n');
    const extractDir = join(root, 'extract');

    const r = extract(appimage, extractDir);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(extractDir, '.appimage-sha'))).toBe(false);
  });
});
