import crypto from 'node:crypto';
import { AD_ENDPOINTS, AD_CSS_SELECTORS } from './types.js';
import fs from 'node:fs';
import path from 'node:path';
import { loadGeneratedRules } from './generated-rules.js';

export interface RuleSet {
  version: number;
  endpoints: string[];
  hosts: string[];
  selectors: Record<string, string[]>;
  source: string;
  hash: string;
}

export interface RuleDelta {
  addEndpoints: string[];
  addHosts?: string[];
  addSelectors: Record<string, string[]>;
  source: string;
}

export function hashRuleSet(rs: { endpoints: string[]; hosts?: string[]; selectors: Record<string, string[]> }): string {
  const canonical = JSON.stringify({ endpoints: [...rs.endpoints].sort(), hosts: [...(rs.hosts ?? [])].sort(), selectors: rs.selectors });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function baseRuleSet(): RuleSet {
  const endpoints = [...AD_ENDPOINTS];
  const selectors = { ...AD_CSS_SELECTORS } as Record<string, string[]>;
  const hosts: string[] = [];
  return { version: 1, endpoints, hosts, selectors, source: 'static', hash: hashRuleSet({ endpoints, hosts, selectors }) };
}

export class RuleRegistry {
  private currentSet: RuleSet;
  private history: RuleSet[] = [];

  constructor(initial?: RuleSet) {
    // Old rules.json files predate host rules; normalize so a missing field is an
    // empty list rather than a crash on first read.
    this.currentSet = initial
      ? { ...initial, hosts: Array.isArray(initial.hosts) ? [...initial.hosts] : [] }
      : baseRuleSet();
  }

  current(): RuleSet {
    return this.currentSet;
  }

  apply(delta: RuleDelta): RuleSet {
    const endpoints = [...this.currentSet.endpoints];
    for (const e of delta.addEndpoints) if (!endpoints.includes(e)) endpoints.push(e);
    const hosts = Array.isArray(this.currentSet.hosts) ? [...this.currentSet.hosts] : [];
    for (const h of delta.addHosts ?? []) if (!hosts.includes(h)) hosts.push(h);
    const selectors: Record<string, string[]> = { ...this.currentSet.selectors };
    for (const [k, v] of Object.entries(delta.addSelectors)) {
      selectors[k] = [...(selectors[k] ?? []), ...v.filter((x) => !(selectors[k] ?? []).includes(x))];
    }
    const next: RuleSet = {
      version: this.currentSet.version + 1,
      endpoints,
      hosts,
      selectors,
      source: delta.source,
      hash: '',
    };
    next.hash = hashRuleSet(next);
    this.history.push(this.currentSet);
    this.currentSet = next;
    return next;
  }

  rollback(): RuleSet | null {
    const prev = this.history.pop();
    if (!prev) return null;
    this.currentSet = prev;
    return prev;
  }

  save(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
    const currentPath = path.join(dir, 'rules.json');
    const prevPath = path.join(dir, 'rules.prev.json');
    if (fs.existsSync(currentPath)) {
      try { fs.copyFileSync(currentPath, prevPath); } catch { /* ignore */ }
    }
    fs.writeFileSync(currentPath, JSON.stringify(this.currentSet, null, 2));
  }

  rollbackFromDisk(dir: string): RuleSet | null {
    const prevPath = path.join(dir, 'rules.prev.json');
    if (!fs.existsSync(prevPath)) return null;
    try {
      const rs = JSON.parse(fs.readFileSync(prevPath, 'utf8')) as RuleSet;
      this.currentSet = { ...rs, hosts: Array.isArray(rs.hosts) ? rs.hosts : [] };
      return rs;
    } catch { return null; }
  }

  static load(dir: string): RuleRegistry | null {
    const p = path.join(dir, 'rules.json');
    if (!fs.existsSync(p)) return null;
    try {
      const rs = JSON.parse(fs.readFileSync(p, 'utf8')) as RuleSet;
      return new RuleRegistry(rs);
    } catch { return null; }
  }
}

/**
 * The rule set production actually uses: saved rules plus shipped, user and
 * feed deltas. Both bootstrap and the replay gate must see the same set.
 */
export function loadEffectiveRegistry(configDir: string, shippedPath?: string): RuleRegistry {
  const registry = RuleRegistry.load(configDir) ?? new RuleRegistry();
  const shipped = shippedPath ?? path.join(__dirname, '..', 'config', 'generated-rules.json');
  for (const file of [
    shipped,
    path.join(configDir, 'generated-rules.json'),
    path.join(configDir, 'feed-rules.json'),
  ]) {
    try {
      const delta = loadGeneratedRules(file);
      if (delta) registry.apply(delta);
    } catch { /* fail open on an unreadable delta */ }
  }
  return registry;
}
