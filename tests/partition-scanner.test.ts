import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { discoverPartitions } from '../src/partition-scanner.js';

describe('partition-scanner', () => {
  it('discovers matching dirs', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-'));
    const pdir = path.join(tmp, 'Partitions');
    fs.mkdirSync(pdir);
    fs.mkdirSync(path.join(pdir, 'freebuff-hosted-v1-abc'));
    fs.mkdirSync(path.join(pdir, 'other-xyz'));
    const res = discoverPartitions(tmp, /^freebuff-/);
    expect(res).toContain('persist:freebuff-hosted-v1-abc');
    expect(res).not.toContain('persist:other-xyz');
  });
  it('returns empty if no dir', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps2-'));
    expect(discoverPartitions(tmp, /^freebuff-/)).toEqual([]);
  });
});
