import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '..');
const installs: Array<{ root: string; copy: string; binDir: string }> = [];
const children: ChildProcess[] = [];

type Run = { code: number | null; stdout: string; stderr: string };

beforeAll(() => {
  if (fs.existsSync(path.join(repo, 'dist', 'cli.js'))) return;
  const npmExecpath = process.env.npm_execpath;
  if (!npmExecpath) throw new Error('dist/cli.js is missing; run npm run build before tests');
  execFileSync(process.execPath, [npmExecpath, 'run', 'build'], { cwd: repo, stdio: 'inherit' });
});

afterEach(() => {
  children.splice(0).forEach((child) => { if (!child.killed) child.kill(); });
  installs.splice(0).forEach(({ root, binDir }) => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  });
});

function makeInstall(segment: string): { root: string; copy: string; binDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'selfheal-path-'));
  const copy = path.join(root, segment);
  for (const dir of ['scripts', 'corpus', 'config', path.join('resources', 'orchestrator'), 'out']) {
    fs.mkdirSync(path.join(copy, dir), { recursive: true });
  }
  // These must be copies: Node resolves symlinks to their realpath, which
  // would hide the install-path bug import.meta.url is supposed to see.
  for (const script of ['self-heal.mjs', 'audit-endpoints.mjs', 'update-corpus.mjs']) {
    fs.copyFileSync(path.join(repo, 'scripts', script), path.join(copy, 'scripts', script));
  }
  fs.copyFileSync(path.join(repo, 'corpus', 'golden.jsonl'), path.join(copy, 'corpus', 'golden.jsonl'));
  fs.writeFileSync(path.join(copy, 'corpus', 'manifest.json'), JSON.stringify({ freebuffVersion: 'sentinel' }));
  fs.copyFileSync(path.join(repo, 'config', 'endpoint-baseline.json'), path.join(copy, 'config', 'endpoint-baseline.json'));
  fs.copyFileSync(path.join(repo, 'package.json'), path.join(copy, 'package.json'));
  fs.symlinkSync(path.join(repo, 'dist'), path.join(copy, 'dist'), 'dir');
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(copy, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(copy, 'resources', 'orchestrator', 'app.js'), '// benign: no ad routes or selectors');
  fs.writeFileSync(path.join(copy, 'resources', 'package.json'), JSON.stringify({ version: '0.0.205' }));

  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfheal-bin-'));
  fs.symlinkSync(process.execPath, path.join(binDir, 'node'));
  const install = { root, copy, binDir };
  installs.push(install);
  return install;
}

function run(install: { copy: string; binDir: string }): Promise<Run> {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(install.copy, 'scripts', 'self-heal.mjs'),
      '--resources', path.join(install.copy, 'resources'),
      '--out', path.join(install.copy, 'out', 'generated-rules.json'),
      '--json',
    ];
    const child = spawn(process.execPath, args, {
      cwd: repo,
      env: { ...process.env, PATH: `${install.binDir}${path.delimiter}${process.env.PATH ?? ''}` },
    });
    children.push(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    const timer = setTimeout(() => { child.kill(); reject(new Error('self-heal timed out')); }, 10000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

async function expectHealthy(install: { copy: string; binDir: string }): Promise<void> {
  const result = await run(install);
  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  const summary = JSON.parse(result.stdout) as { pass: boolean; payloadVersion: string };
  expect(summary.pass).toBe(true);
  expect(summary.payloadVersion).toBe('0.0.205');
  const artifact = JSON.parse(fs.readFileSync(path.join(install.copy, 'out', 'generated-rules.json'), 'utf8')) as { source: string };
  expect(artifact.source).toBe('ci-healed:0.0.205');
  const manifest = JSON.parse(fs.readFileSync(path.join(install.copy, 'corpus', 'manifest.json'), 'utf8')) as { freebuffVersion: string };
  expect(manifest.freebuffVersion).toBe('0.0.205');
}

describe('self-heal install paths', () => {
  it('heals from a plain install path', async () => {
    await expectHealthy(makeInstall('plain'));
  });

  it.each(['with space', 'with%20literal'])('heals from an install path containing %s', async (segment) => {
    await expectHealthy(makeInstall(segment));
  });
});
