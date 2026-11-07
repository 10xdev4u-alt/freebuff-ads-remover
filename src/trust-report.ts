import crypto from 'node:crypto';
import type { RuleRegistry } from './rule-registry.js';

export interface TrustReport {
  generatedAt: string;
  ruleVersion: number;
  ruleHash: string;
  corpusEntries: number;
  reportHash: string;
}

export function buildTrustReport(registry: RuleRegistry, corpusEntries: number): TrustReport {
  const r = registry.current();
  const base = { generatedAt: new Date().toISOString(), ruleVersion: r.version, ruleHash: r.hash, corpusEntries };
  const canonical = JSON.stringify({ ruleVersion: base.ruleVersion, ruleHash: base.ruleHash, corpusEntries: base.corpusEntries });
  const reportHash = crypto.createHash('sha256').update(canonical).digest('hex');
  return { ...base, reportHash };
}
