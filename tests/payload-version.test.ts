import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const require = createRequire(path.join(__dirname, 'payload-version.test.ts'));
const asar = require('@electron/asar') as {
  createPackage: (src: string, dest: string) => Promise<void>;
};
const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'scripts', 'payload-version.mjs');

let tmp: string;
let resources: string;

function run(args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' }).trim();
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-payload-version-'));
  const unpacked = path.join(tmp, 'unpacked');
  fs.mkdirSync(unpacked);
  fs.writeFileSync(
    path.join(unpacked, 'package.json'),
    JSON.stringify({ name: '@codebuff/freebuff-desktop', version: '9.9.9' }),
  );
  await asar.createPackage(unpacked, path.join(tmp, 'app.asar'));
  fs.rmSync(unpacked, { recursive: true, force: true });

  resources = path.join(tmp, 'resources');
  fs.mkdirSync(resources);
  fs.copyFileSync(path.join(tmp, 'app.asar'), path.join(resources, 'app.asar'));
});

afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('payload-version', () => {
  it('reads name and version from a packed payload', () => {
    expect(run([resources])).toBe('@codebuff/freebuff-desktop 9.9.9');
  });

  it('emits structured output with --json', () => {
    expect(JSON.parse(run([resources, '--json']))).toEqual({
      name: '@codebuff/freebuff-desktop',
      version: '9.9.9',
      source: 'payload',
    });
  });

  it('reads an unpacked package.json', () => {
    const dir = path.join(tmp, 'plain');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'freebuff', version: '1.2.3' }));
    expect(run([dir])).toBe('freebuff 1.2.3');
  });

  it('fails instead of guessing when a given payload has no version', () => {
    const dir = path.join(tmp, 'empty');
    fs.mkdirSync(dir);
    expect(() => run([dir])).toThrow();
  });

  it('falls back to the newest receipt when no payload is given', () => {
    expect(run([])).toMatch(/^\S+ \S+$/);
  });
});
