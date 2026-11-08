import fs from 'node:fs';
import type { RuleDelta } from './rule-registry.js';

export function loadGeneratedRules(path?: string): RuleDelta | null {
  const p = path ?? (process.env.FREEBUFF_GENERATED_RULES_PATH || '');
  if (!p) return null;
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw) as RuleDelta;
  } catch {
    return null;
  }
}

export const GENERATED_RULES: RuleDelta | null = null;
