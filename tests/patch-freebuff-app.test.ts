import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPackageWithOptions, extractFile } from '@electron/asar';

const script = join(process.cwd(), 'scripts', 'patch-freebuff-app.mjs');
let root: string;
let resources: string;

function runPatch(entry: string): string {
  return execFileSync(process.execPath, [script, resources], {
    env: { ...process.env, FREEBUFF_ADS_REMOVER_ENTRY: entry },
    encoding: 'utf8',
  });
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'far-patch-'));
  resources = join(root, 'resources');
  const payload = join(root, 'payload');
  mkdirSync(join(payload, 'electron'), { recursive: true });
  writeFileSync(join(payload, 'package.json'), JSON.stringify({ name: 'fake', main: 'electron/main.cjs' }));
  writeFileSync(join(payload, 'electron', 'main.cjs'), 'console.log("boot");\n');
  mkdirSync(resources, { recursive: true });
  await createPackageWithOptions(payload, join(resources, 'app.asar'), {});
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('patch-freebuff-app', () => {
  it('repacks app.asar instead of unpacking resources/app', async () => {
    runPatch('/tmp/extension-entry.js');

    expect(existsSync(join(resources, 'app'))).toBe(false);
    expect(existsSync(join(resources, 'app.asar.orig'))).toBe(true);
    const main = extractFile(join(resources, 'app.asar'), 'electron/main.cjs').toString('utf8');
    expect(main).toContain('freebuff-ads-remover:begin');
    expect(main).toContain('require("/tmp/extension-entry.js")');
    expect(main).toContain('console.log("boot")');
  });

  it('keeps the pristine archive untouched in app.asar.orig', () => {
    const before = extractFile(join(resources, 'app.asar'), 'electron/main.cjs').toString('utf8');
    runPatch('/tmp/extension-entry.js');
    const backup = extractFile(join(resources, 'app.asar.orig'), 'electron/main.cjs').toString('utf8');
    expect(backup).toBe(before);
  });

  it('is idempotent and re-bakes a moved extension path', () => {
    runPatch('/tmp/extension-entry.js');
    expect(runPatch('/tmp/extension-entry.js')).toContain('already patched');
    expect(runPatch('/tmp/other-entry.js')).toContain('loader entry: /tmp/other-entry.js');
    const main = extractFile(join(resources, 'app.asar'), 'electron/main.cjs').toString('utf8');
    expect(main).toContain('require("/tmp/other-entry.js")');
    expect(main).not.toContain('require("/tmp/extension-entry.js")');
    expect(main.match(/freebuff-ads-remover:begin/g)).toHaveLength(1);
  });

  it('migrates a legacy unpacked resources/app patch', () => {
    runPatch('/tmp/extension-entry.js');
    // Simulate the old layout: archive aside, patched tree in resources/app.
    const asar = join(resources, 'app.asar');
    const legacy = join(resources, 'app');
    mkdirSync(join(legacy, 'electron'), { recursive: true });
    writeFileSync(join(legacy, 'electron', 'main.cjs'), readFileSync(join(root, 'payload', 'electron', 'main.cjs')));
    rmSync(asar);
    execFileSync('mv', [join(resources, 'app.asar.orig'), asar]);

    runPatch('/tmp/extension-entry.js');

    expect(existsSync(legacy)).toBe(false);
    const main = extractFile(asar, 'electron/main.cjs').toString('utf8');
    expect(main).toContain('freebuff-ads-remover:begin');
  });
});
