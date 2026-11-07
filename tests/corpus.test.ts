import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCorpus, verifyCorpus } from '../src/corpus.js';

describe('corpus', () => {
  it('loads and verifies golden corpus', () => {
    const dir = path.join(process.cwd(), 'corpus');
    const { entries, manifest } = loadCorpus(dir);
    expect(entries.length).toBe(manifest.entries);
    expect(manifest.ads).toBeGreaterThan(0);
    expect(verifyCorpus(dir)).toBe(true);
  });
  it('fails on tampered hash', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'corp-'));
    fs.copyFileSync(path.join(process.cwd(), 'corpus', 'golden.jsonl'), path.join(tmp, 'golden.jsonl'));
    fs.copyFileSync(path.join(process.cwd(), 'corpus', 'manifest.json'), path.join(tmp, 'manifest.json'));
    const m = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8')) as { sha256: string };
    m.sha256 = '0'.repeat(64);
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(m));
    expect(verifyCorpus(tmp)).toBe(false);
  });
});
