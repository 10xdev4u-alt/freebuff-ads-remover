import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlockLog } from '../src/block-log.js';

describe('block-log', () => {
  it('appends and reads', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-'));
    const f = path.join(tmp, 'block-log.jsonl');
    const log = new BlockLog(f);
    log.append({ v: 1, at: 1, stage: 's', surface: 'x', endpoint: '/e', session: 'd' });
    const entries = log.read();
    expect(entries).toHaveLength(1);
    expect(entries[0].endpoint).toBe('/e');
  });
  it('no url field in entry type', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bl2-'));
    const f = path.join(tmp, 'block-log.jsonl');
    const log = new BlockLog(f);
    log.append({ v: 1, at: 2, stage: 's', surface: 'x', endpoint: '/e', session: 'd' });
    const raw = fs.readFileSync(f, 'utf8');
    expect(raw).not.toContain('http');
  });
});
