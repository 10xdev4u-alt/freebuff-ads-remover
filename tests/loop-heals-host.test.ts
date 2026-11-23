import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterAll } from 'vitest';

const repo = path.resolve(__dirname, '..');
const fixture = path.join(repo, 'tests', 'fixtures', 'payload-absolute', 'resources');
const corpusFiles = ['corpus/golden.jsonl', 'corpus/manifest.json'];
const corpusBackup = new Map<string, string>();

describe('loop heals an ad host', () => {
  it('emits a host rule instead of an origin endpoint', () => {
    for (const f of corpusFiles) corpusBackup.set(f, fs.readFileSync(path.join(repo, f), 'utf8'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-host-'));
    const outPath = path.join(tmp, 'rules.json');
    const receiptPath = path.join(tmp, 'receipt.json');
    try {
      const raw = execSync(
        `${JSON.stringify(process.execPath)} scripts/self-heal.mjs --resources ${JSON.stringify(fixture)} --out ${JSON.stringify(outPath)} --receipt ${JSON.stringify(receiptPath)} --json`,
        { cwd: repo, encoding: 'utf8' },
      );
      const res = JSON.parse(raw) as { pass: boolean; addedEndpoints: string[]; addedHosts: string[] };
      expect(res.pass).toBe(true);
      expect(res.addedHosts).toContain('ads.example.com');
      expect(res.addedEndpoints).not.toContain('https://ads.example.com/');

      const artifact = JSON.parse(fs.readFileSync(outPath, 'utf8')) as { addHosts?: string[]; addEndpoints: string[] };
      expect(artifact.addHosts).toEqual(['ads.example.com']);
      expect(artifact.addEndpoints).toEqual([]);

      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as { gate: { pass: boolean }; addedHosts: string[] };
      expect(receipt.gate.pass).toBe(true);
      expect(receipt.addedHosts).toEqual(['ads.example.com']);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

afterAll(() => {
  for (const [f, v] of corpusBackup) fs.writeFileSync(path.join(repo, f), v);
  corpusBackup.clear();
});
