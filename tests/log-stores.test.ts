import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BlockLog } from '../src/block-log.js';
import { MissLog } from '../src/miss-log.js';
import { OutcomeLog } from '../src/outcome-log.js';

function tmpFile(prefix: string): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), prefix)), 'log.jsonl');
}

describe('miss-log', () => {
  it('appends, reads, filters by since and limits', () => {
    const f = tmpFile('miss-');
    const log = new MissLog(f);
    log.append({ v: 1, at: 10, route: '/api/ad/a' });
    log.append({ v: 1, at: 20, route: '/api/ad/b' });
    log.append({ v: 1, at: 30, route: '/api/ad/c' });

    expect(log.read()).toHaveLength(3);
    expect(log.read({ since: 20 }).map((e) => e.route)).toEqual(['/api/ad/b', '/api/ad/c']);
    expect(log.read({ limit: 2 }).map((e) => e.route)).toEqual(['/api/ad/b', '/api/ad/c']);
    expect(log.read({ since: 20, limit: 1 }).map((e) => e.route)).toEqual(['/api/ad/c']);
  });

  it('returns [] for a missing file', () => {
    expect(new MissLog(path.join(os.tmpdir(), 'far-miss-absent', 'log.jsonl')).read()).toEqual([]);
  });

  it('returns [] for a corrupt file', () => {
    const f = tmpFile('miss-bad-');
    fs.writeFileSync(f, 'not json\n');
    expect(new MissLog(f).read()).toEqual([]);
  });

  it('fails open when the path is unwritable', () => {
    const log = new MissLog(path.join(os.tmpdir(), 'far-miss-absent', 'log.jsonl'));
    expect(() => { log.append({ v: 1, at: 1, route: '/x' }); }).not.toThrow();
  });

  it('rotates once the file exceeds maxBytes', () => {
    const f = tmpFile('miss-rot-');
    const log = new MissLog(f, 1);
    log.append({ v: 1, at: 1, route: '/api/ad/a' });
    log.append({ v: 1, at: 2, route: '/api/ad/b' });
    // The first append renamed the file to `.1`; the second append wrote a new
    // file and renamed that over the rotation.
    expect(fs.existsSync(f + '.1')).toBe(true);
    expect(fs.existsSync(f)).toBe(false);
  });
});

describe('outcome-log', () => {
  it('appends, reads, filters by since and limits', () => {
    const f = tmpFile('out-');
    const log = new OutcomeLog(f);
    log.append({ v: 1, at: 10, healHash: 'h1', route: '/api/ad/a', suppressed: true });
    log.append({ v: 1, at: 20, healHash: 'h2', route: '/api/ad/b', suppressed: false });
    log.append({ v: 1, at: 30, healHash: 'h3', route: '/api/ad/c', suppressed: true });

    expect(log.read()).toHaveLength(3);
    expect(log.read({ since: 20 }).map((e) => e.healHash)).toEqual(['h2', 'h3']);
    expect(log.read({ limit: 1 }).map((e) => e.healHash)).toEqual(['h3']);
  });

  it('returns [] for a missing file', () => {
    expect(new OutcomeLog(path.join(os.tmpdir(), 'far-out-absent', 'log.jsonl')).read()).toEqual([]);
  });

  it('returns [] for a corrupt file', () => {
    const f = tmpFile('out-bad-');
    fs.writeFileSync(f, '{broken\n');
    expect(new OutcomeLog(f).read()).toEqual([]);
  });

  it('fails open when the path is unwritable', () => {
    const log = new OutcomeLog(path.join(os.tmpdir(), 'far-out-absent', 'log.jsonl'));
    expect(() => { log.append({ v: 1, at: 1, healHash: 'h', route: '/x', suppressed: true }); }).not.toThrow();
  });

  it('rotates once the file exceeds maxBytes', () => {
    const f = tmpFile('out-rot-');
    const log = new OutcomeLog(f, 1);
    log.append({ v: 1, at: 1, healHash: 'h1', route: '/api/ad/a', suppressed: true });
    log.append({ v: 1, at: 2, healHash: 'h2', route: '/api/ad/b', suppressed: true });
    expect(fs.existsSync(f + '.1')).toBe(true);
  });
});

describe('block-log json/csv', () => {
  it('renders json and csv with escaped quotes', () => {
    const f = tmpFile('block-');
    const log = new BlockLog(f);
    log.append({ v: 1, at: 7, stage: 'policy', surface: 'sponsorBreak', endpoint: '/api/ad/"quoted"', session: 'default' });

    expect(JSON.parse(log.toJson())).toHaveLength(1);
    const csv = log.toCsv();
    expect(csv.split('\n')[0]).toBe('v,at,stage,surface,endpoint,session');
    expect(csv).toContain('"/api/ad/""quoted"""');
  });

  it('honours since/limit in json and csv', () => {
    const f = tmpFile('block-2-');
    const log = new BlockLog(f);
    log.append({ v: 1, at: 1, stage: 'a', surface: 's', endpoint: '/1', session: 'd' });
    log.append({ v: 1, at: 2, stage: 'b', surface: 's', endpoint: '/2', session: 'd' });
    expect(JSON.parse(log.toJson({ since: 2 }))).toHaveLength(1);
    expect(log.toCsv({ limit: 1 }).split('\n')).toHaveLength(2);
  });

  it('reads a missing file as empty', () => {
    const log = new BlockLog(path.join(os.tmpdir(), 'far-block-absent', 'log.jsonl'));
    expect(log.read()).toEqual([]);
    expect(log.toJson()).toBe('[]');
    expect(log.toCsv()).toBe('v,at,stage,surface,endpoint,session');
  });

  it('returns [] for a corrupt file', () => {
    const f = tmpFile('block-bad-');
    fs.writeFileSync(f, 'nope\n');
    expect(new BlockLog(f).read()).toEqual([]);
  });

  it('rotates once the file exceeds maxBytes', () => {
    const f = tmpFile('block-rot-');
    const log = new BlockLog(f, 1);
    log.append({ v: 1, at: 1, stage: 'a', surface: 's', endpoint: '/1', session: 'd' });
    log.append({ v: 1, at: 2, stage: 'b', surface: 's', endpoint: '/2', session: 'd' });
    expect(fs.existsSync(f + '.1')).toBe(true);
  });

  it('reads rotated entries as well as the active file', () => {
    const f = tmpFile('block-rot-read-');
    const log = new BlockLog(f, 80);
    for (let at = 1; at <= 3; at++) {
      log.append({ v: 1, at, stage: 'a', surface: 's', endpoint: '/x', session: 'd' });
    }
    expect(log.read().map((e) => e.at)).toEqual([1, 2, 3]);
    expect(JSON.parse(log.toJson())).toHaveLength(3);
    expect(log.toCsv().split('\n')).toHaveLength(4);
  });

  it('merges a pre-existing rotated segment before the active file', () => {
    const f = tmpFile('block-merge-');
    const entry = (at: number) => ({ v: 1, at, stage: 'a', surface: 's', endpoint: '/x', session: 'd' });
    fs.writeFileSync(f + '.1', [entry(1), entry(2)].map((e) => JSON.stringify(e)).join('\n') + '\n');
    fs.writeFileSync(f, JSON.stringify(entry(3)) + '\n');
    const log = new BlockLog(f);
    expect(log.read().map((e) => e.at)).toEqual([1, 2, 3]);
    expect(log.read({ limit: 2 }).map((e) => e.at)).toEqual([2, 3]);
    expect(log.read({ since: 2 }).map((e) => e.at)).toEqual([2, 3]);
  });

  it('fails open when the path is unwritable', () => {
    const log = new BlockLog(path.join(os.tmpdir(), 'far-block-absent', 'log.jsonl'));
    expect(() => { log.append({ v: 1, at: 1, stage: 'a', surface: 's', endpoint: '/1', session: 'd' }); }).not.toThrow();
  });
});
