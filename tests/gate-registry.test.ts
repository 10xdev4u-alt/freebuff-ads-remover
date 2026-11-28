import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { runGate } from '../src/gate.js';
import { RuleRegistry } from '../src/rule-registry.js';

const repo = path.resolve(__dirname, '..');
const realCorpus = path.join(repo, 'corpus');
const NOVEL_EP = '/api/ad/canary-healed-route';
const NOVEL_HOST_AD = '/api/ad/host-canary-route';
type Entry = { path: string; label: 'ad' | 'control' };

const tmpDirs: string[] = [];
const savedDir = process.env.FREEBUFF_CONFIG_DIR;
const savedProfile = process.env.FREEBUFF_PROFILE;
let configDir: string;

function makeCorpus(entries: Entry[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-gate-reg-'));
  tmpDirs.push(dir);
  const raw = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'golden.jsonl'), raw);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    version: 1,
    freebuffVersion: 'test',
    entries: entries.length,
    ads: entries.filter((entry) => entry.label === 'ad').length,
    controls: entries.filter((entry) => entry.label === 'control').length,
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
  }));
  return dir;
}

beforeEach(() => {
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-gate-cfg-'));
  tmpDirs.push(configDir);
  process.env.FREEBUFF_CONFIG_DIR = configDir;
  delete process.env.FREEBUFF_PROFILE;
});

afterEach(() => {
  if (savedDir === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
  else process.env.FREEBUFF_CONFIG_DIR = savedDir;
  if (savedProfile === undefined) delete process.env.FREEBUFF_PROFILE;
  else process.env.FREEBUFF_PROFILE = savedProfile;
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('runGate effective rules', () => {
  it('honours an extra endpoint saved to rules.json', () => {
    const corpus = makeCorpus([
      { path: NOVEL_EP, label: 'ad' },
      { path: '/healthz', label: 'control' },
    ]);
    const before = runGate(corpus);
    expect(before.missedAds).toEqual([NOVEL_EP]);
    expect(before.pass).toBe(false);

    const registry = new RuleRegistry();
    registry.apply({ addEndpoints: [NOVEL_EP], addSelectors: {}, source: 'test' });
    registry.save(configDir);
    expect(RuleRegistry.load(configDir)?.current().endpoints).toContain(NOVEL_EP);

    const after = runGate(corpus);
    expect(after.missedAds).toEqual([]);
    expect(after.recall).toBe(1);
    expect(after.precision).toBe(1);
    expect(after.pass).toBe(true);
    expect(after.candidate.endpoints).toBe(before.candidate.endpoints + 1);
  });

  it('honours an extra host saved to rules.json', () => {
    const corpus = makeCorpus([{ path: NOVEL_HOST_AD, label: 'ad' }]);
    expect(runGate(corpus).missedAds).toEqual([NOVEL_HOST_AD]);

    const registry = new RuleRegistry();
    registry.apply({ addHosts: ['x'], addEndpoints: [], addSelectors: {}, source: 'test' });
    registry.save(configDir);
    expect(RuleRegistry.load(configDir)?.current().hosts).toContain('x');

    const after = runGate(corpus);
    expect(after.missedAds).toEqual([]);
    expect(after.pass).toBe(true);
  });

  it('still passes the real corpus with no or corrupt saved rules', () => {
    expect(RuleRegistry.load(configDir)).toBeNull();
    expect(runGate(realCorpus).pass).toBe(true);
    fs.writeFileSync(path.join(configDir, 'rules.json'), '{broken');
    expect(RuleRegistry.load(configDir)).toBeNull();
    expect(runGate(realCorpus).pass).toBe(true);
  });
});
