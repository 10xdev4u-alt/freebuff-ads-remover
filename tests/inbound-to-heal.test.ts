import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const repo = path.resolve(__dirname, '..');
const fixture = path.join(repo, 'tests', 'fixtures', 'payload-rename', 'resources');
const corpusFiles = ['corpus/golden.jsonl', 'corpus/manifest.json'];
const corpusBackup = new Map<string, string>();

function restore() {
  for (const [f, v] of corpusBackup) fs.writeFileSync(path.join(repo, f), v);
}

describe('inbound candidates reach heal', () => {
  beforeAll(() => {
    for (const f of corpusFiles) corpusBackup.set(f, fs.readFileSync(path.join(repo, f), 'utf8'));
    if (!fs.existsSync(path.join(repo, 'dist', 'interceptor.js'))) {
      execSync('npm run build', { cwd: repo, stdio: 'inherit' });
    }
  });
  afterAll(restore);

  it('adds a corroborated candidate the audit did not find', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-inbound-'));
    const candidates = path.join(tmp, 'candidates.json');
    fs.writeFileSync(candidates, JSON.stringify({
      candidates: [{ route: '/api/ad/inbound-drill', installs: 9, confidence: 0.9 }],
    }));
    const outPath = path.join(tmp, 'rules.json');
    const receiptPath = path.join(tmp, 'receipt.json');

    const raw = execSync(
      `node scripts/self-heal.mjs --resources ${JSON.stringify(fixture)} --out ${JSON.stringify(outPath)} --receipt ${JSON.stringify(receiptPath)} --candidates ${JSON.stringify(candidates)} --json`,
      { cwd: repo, encoding: 'utf8' },
    );

    const res = JSON.parse(raw) as { pass: boolean; addedEndpoints: string[] };
    expect(res.pass).toBe(true);
    expect(res.addedEndpoints).toContain('/api/ad/inbound-drill');
    restore();
  });

  it('fails when the explicit candidates file is missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-inbound-'));
    const r = spawnSync(
      process.execPath,
      ['scripts/self-heal.mjs', '--resources', fixture, '--out', path.join(tmp, 'rules.json'), '--candidates', path.join(tmp, 'nope.json')],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('candidates file missing');
    restore();
  });

  it('fails when the explicit candidates file is unreadable', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-inbound-'));
    const candidates = path.join(tmp, 'candidates.json');
    fs.writeFileSync(candidates, '{not json');
    const r = spawnSync(
      process.execPath,
      ['scripts/self-heal.mjs', '--resources', fixture, '--out', path.join(tmp, 'rules.json'), '--candidates', candidates],
      { cwd: repo, encoding: 'utf8' },
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('candidates file unreadable');
    restore();
  });
});
