import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(__dirname, '..');
const bin = path.join(repo, 'bin', 'farbuff.mjs');
const cleanups: Array<() => void> = [];
const children: ChildProcess[] = [];

type Run = { code: number | null; stdout: string; stderr: string };

function run(args: string[], cwd: string, env: Record<string, string>): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env } });
    children.push(child);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', reject);
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI timed out')); }, 10000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

type HeldServer = {
  port: number;
  bodies: string[];
  firstRequest: Promise<void>;
  release: () => void;
  close: () => void;
};

async function heldServer(): Promise<HeldServer> {
  const bodies: string[] = [];
  let first!: () => void;
  const firstRequest = new Promise<void>((resolve) => { first = resolve; });
  let go!: () => void;
  const released = new Promise<void>((resolve) => { go = resolve; });
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      bodies.push(body);
      first();
      void released.then(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"ok":true}');
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 0;
  return {
    port,
    bodies,
    firstRequest,
    release: () => { go(); },
    close: () => { server.closeAllConnections(); server.close(); },
  };
}

beforeAll(() => {
  if (fs.existsSync(path.join(repo, 'dist', 'cli.js'))) return;
  const npmExecpath = process.env.npm_execpath;
  if (!npmExecpath) throw new Error('dist/cli.js is missing; run npm run build before tests');
  execFileSync(process.execPath, [npmExecpath, 'run', 'build'], {
    cwd: repo, stdio: 'inherit',
  });
});

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => { cleanup(); });
  children.splice(0).forEach((child) => { if (!child.killed) child.kill(); });
});

async function relayCase(command: 'submit-misses' | 'submit-outcomes', file: string): Promise<void> {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-entry-config-'));
  cleanups.push(() => { fs.rmSync(configDir, { recursive: true, force: true }); });
  const rows = [
    { v: 1, at: 1, route: '/a' },
    { v: 1, at: 2, route: '/b' },
  ];
  fs.writeFileSync(path.join(configDir, file), rows.map((row) => JSON.stringify(row)).join('\n') + '\n');

  const server = await heldServer();
  cleanups.push(server.close);
  const closed = run([bin, command, '--url', `http://127.0.0.1:${String(server.port)}/submit`], repo, {
    FREEBUFF_CONFIG_DIR: configDir,
  });
  const winner = await Promise.race([
    server.firstRequest.then(() => 'request'),
    closed.then(() => 'exit'),
  ]);
  expect(winner, 'the POST must arrive before the process exits').toBe('request');

  server.release();
  const result = await closed;
  expect(result.code).toBe(0);
  expect(result.stdout).toContain('"submitted":2');
  expect(result.stdout).toContain('"status":200');
  const submitted = JSON.parse(server.bodies[0] ?? '{}') as { envelopes: unknown[] };
  expect(submitted.envelopes).toHaveLength(2);
  expect(fs.readFileSync(path.join(configDir, file), 'utf8').trim()).toBe('');
}

describe('farbuff CLI entry point', () => {
  it('lets submit-misses finish before the process exits', async () => {
    await relayCase('submit-misses', 'miss-log.jsonl');
  });

  it('lets submit-outcomes finish before the process exits', async () => {
    await relayCase('submit-outcomes', 'outcomes.jsonl');
  });

  it.each(['with space', 'with%20literal'])('resolves dist under the install path %s', async (segment) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-entry-'));
    const spaced = path.join(root, segment);
    cleanups.push(() => { fs.rmSync(root, { recursive: true, force: true }); });
    const binDir = path.join(spaced, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const spacedBin = path.join(binDir, 'farbuff.mjs');
    fs.copyFileSync(bin, spacedBin);
    fs.symlinkSync(path.join(repo, 'dist'), path.join(spaced, 'dist'), 'dir');
    const configDir = path.join(spaced, 'config');
    fs.mkdirSync(configDir);
    fs.writeFileSync(path.join(configDir, 'config.json'), JSON.stringify({ feed: { enabled: true } }));

    const result = await run([spacedBin, 'config-get', 'feed.enabled'], repo, {
      FREEBUFF_CONFIG_DIR: configDir,
    });

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('true');
    expect(result.stderr).toBe('');
  });

  it('preserves command exit codes', async () => {
    const unknown = await run([bin, 'unknown-command'], repo, {});
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('Unknown command');
    const help = await run([bin, 'help'], repo, {});
    expect(help.code).toBe(0);
  });
});
