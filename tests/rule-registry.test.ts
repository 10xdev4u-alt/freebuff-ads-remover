import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleRegistry, baseRuleSet, hashRuleSet } from '../src/rule-registry.js';
import type { RuleSet } from '../src/rule-registry.js';
import { synthesizeDelta } from '../src/rule-synthesis.js';
import { loadGeneratedRules } from '../src/generated-rules.js';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

afterEach(() => {
  delete process.env.FREEBUFF_GENERATED_RULES_PATH;
});

describe('hashRuleSet', () => {
  it('sorts endpoints and hosts so order does not change the hash', () => {
    const a = hashRuleSet({ endpoints: ['/b', '/a'], hosts: ['z.example', 'a.example'], selectors: { x: ['y'] } });
    const b = hashRuleSet({ endpoints: ['/a', '/b'], hosts: ['a.example', 'z.example'], selectors: { x: ['y'] } });
    expect(a).toBe(b);
  });

  it('treats a missing hosts field as an empty list', () => {
    expect(hashRuleSet({ endpoints: ['/a'], selectors: {} })).toBe(
      hashRuleSet({ endpoints: ['/a'], hosts: [], selectors: {} }),
    );
  });
});

describe('RuleRegistry', () => {
  it('normalizes an initial ruleset with no hosts field', () => {
    const reg = new RuleRegistry({ version: 1, endpoints: ['/a'], selectors: {}, source: 'test', hash: 'x' } as RuleSet);
    expect(reg.current().hosts).toEqual([]);
  });

  it('applies endpoints, hosts and selectors without duplicates', () => {
    const reg = new RuleRegistry();
    const version = reg.current().version;
    const next = reg.apply({
      addEndpoints: ['/api/ad/new', '/api/ad/new'],
      addHosts: ['ads.example.com', 'ads.example.com'],
      addSelectors: { billboard: ['[data-ad]', '[data-extra]'] },
      source: 'test',
    });
    expect(next.endpoints).toContain('/api/ad/new');
    expect(next.endpoints.filter((e) => e === '/api/ad/new')).toHaveLength(1);
    expect(next.hosts).toEqual(['ads.example.com']);
    const billboard = next.selectors.billboard ?? [];
    expect(billboard).toContain('[data-ad]');
    expect(billboard).toContain('[data-extra]');
    expect(next.version).toBe(version + 1);
    expect(next.hash).toBe(hashRuleSet(next));
  });

  it('does not re-add a selector that is already present', () => {
    const reg = new RuleRegistry();
    const before = reg.current().selectors.billboard ?? [];
    expect(before.length).toBeGreaterThan(0);
    const next = reg.apply({ addEndpoints: [], addSelectors: { billboard: [before[0] as string] }, source: 'test' });
    expect(next.selectors.billboard).toHaveLength(before.length);
  });

  it('merges selectors into an existing surface', () => {
    const reg = new RuleRegistry();
    const before = reg.current().selectors.billboard ?? [];
    reg.apply({ addEndpoints: [], addSelectors: { billboard: ['[data-new]'] }, source: 'test' });
    expect(reg.current().selectors.billboard).toEqual([...before, '[data-new]']);
  });

  it('returns null when rolling back with no history', () => {
    expect(new RuleRegistry().rollback()).toBeNull();
  });

  it('rolls back to the previous ruleset', () => {
    const reg = new RuleRegistry();
    const before = reg.current();
    reg.apply({ addEndpoints: ['/api/ad/x'], addSelectors: {}, source: 'test' });
    const rolled = reg.rollback();
    expect(rolled?.hash).toBe(before.hash);
    expect(reg.current().endpoints).not.toContain('/api/ad/x');
  });

  it('saves rules and rolls back from disk', () => {
    const dir = tmpDir('rr-');
    const reg = new RuleRegistry();
    reg.apply({ addEndpoints: ['/api/ad/x'], addSelectors: {}, source: 'test' });
    reg.save(dir);
    // The previous ruleset is copied from the current file, so it only exists
    // after a second save.
    reg.apply({ addEndpoints: ['/api/ad/y'], addSelectors: {}, source: 'test' });
    reg.save(dir);
    expect(fs.existsSync(path.join(dir, 'rules.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'rules.prev.json'))).toBe(true);

    const restored = new RuleRegistry();
    const rolled = restored.rollbackFromDisk(dir);
    expect(rolled).not.toBeNull();
    expect(restored.current().endpoints).toContain('/api/ad/x');
    expect(restored.current().endpoints).not.toContain('/api/ad/y');
  });

  it('returns null from rollbackFromDisk when the previous file is absent or invalid', () => {
    const dir = tmpDir('rr-empty-');
    expect(new RuleRegistry().rollbackFromDisk(dir)).toBeNull();

    fs.writeFileSync(path.join(dir, 'rules.prev.json'), '{broken');
    const reg = new RuleRegistry();
    expect(reg.rollbackFromDisk(dir)).toBeNull();
  });

  it('normalizes a previous file that predates host rules', () => {
    const dir = tmpDir('rr-old-');
    fs.writeFileSync(
      path.join(dir, 'rules.prev.json'),
      JSON.stringify({ version: 1, endpoints: ['/a'], selectors: {}, source: 'old', hash: 'x' }),
    );
    const reg = new RuleRegistry();
    reg.rollbackFromDisk(dir);
    expect(reg.current().hosts).toEqual([]);
  });

  it('loads a saved registry and returns null for missing or invalid files', () => {
    const dir = tmpDir('rr-load-');
    expect(RuleRegistry.load(dir)).toBeNull();

    fs.writeFileSync(path.join(dir, 'rules.json'), '{broken');
    expect(RuleRegistry.load(dir)).toBeNull();

    const reg = new RuleRegistry();
    reg.apply({ addHosts: ['ads.example.com'], addEndpoints: [], addSelectors: {}, source: 'test' });
    reg.save(dir);
    const loaded = RuleRegistry.load(dir);
    expect(loaded?.current().hosts).toEqual(['ads.example.com']);
  });

  it('starts from the static base ruleset', () => {
    const base = baseRuleSet();
    expect(base.source).toBe('static');
    expect(base.hosts).toEqual([]);
    expect(base.endpoints.length).toBeGreaterThan(0);
  });
});

describe('synthesizeDelta', () => {
  it('returns null when there is nothing to add', () => {
    expect(synthesizeDelta([], 'audit')).toBeNull();
    expect(synthesizeDelta([{ route: '', host: '', selector: 'x' }], 'audit')).toBeNull();
  });

  it('dedupes routes, hosts and selectors', () => {
    const delta = synthesizeDelta(
      [
        { route: '/api/ad/a', host: 'ads.example.com', selector: '[data-ad]', surface: 'billboard' },
        { route: '/api/ad/a', host: 'ads.example.com', selector: '[data-ad]', surface: 'billboard' },
      ],
      'audit',
    );
    expect(delta?.addEndpoints).toEqual(['/api/ad/a']);
    expect(delta?.addHosts).toEqual(['ads.example.com']);
    expect(delta?.addSelectors).toEqual({ billboard: ['[data-ad]'] });
  });

  it('omits addHosts when no host gap is present', () => {
    const delta = synthesizeDelta([{ route: '/api/ad/a' }], 'audit');
    expect(delta).not.toHaveProperty('addHosts');
    expect(delta?.source).toBe('audit');
  });

  it('ignores a selector without a surface', () => {
    const delta = synthesizeDelta([{ selector: '[data-ad]' }], 'audit');
    expect(delta).toBeNull();
  });
});

describe('loadGeneratedRules', () => {
  it('returns null without a path', () => {
    delete process.env.FREEBUFF_GENERATED_RULES_PATH;
    expect(loadGeneratedRules()).toBeNull();
  });

  it('returns null for a missing or invalid file', () => {
    const dir = tmpDir('gen-');
    expect(loadGeneratedRules(path.join(dir, 'absent.json'))).toBeNull();
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{broken');
    expect(loadGeneratedRules(bad)).toBeNull();
  });

  it('loads a valid delta and honours the environment override', () => {
    const dir = tmpDir('gen-ok-');
    const file = path.join(dir, 'rules.json');
    fs.writeFileSync(file, JSON.stringify({ addEndpoints: ['/api/ad/x'], addSelectors: {}, source: 'feed' }));
    expect(loadGeneratedRules(file)).toMatchObject({ addEndpoints: ['/api/ad/x'] });

    process.env.FREEBUFF_GENERATED_RULES_PATH = file;
    expect(loadGeneratedRules()).toMatchObject({ addEndpoints: ['/api/ad/x'] });
  });
});
