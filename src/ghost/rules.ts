/**
 * Declarative neutralization rule engine for Ghost Mode.
 * Rules are auditable, per-preset, no ML/heuristics.
 */
export type GhostContext = 'postMessage' | 'customEvent' | 'fetch' | 'beacon' | 'domMarker' | 'global';
export type GhostAction = 'redact' | 'strip' | 'teardown';

export interface GhostRule {
  id: string;
  context: GhostContext;
  match: { signature: string; origin?: string };
  action: GhostAction;
  fields?: string[];
  preset: 'standard' | 'aggressive' | 'paranoid';
}

export type Preset = 'standard' | 'aggressive' | 'paranoid';

export const STANDARD_RULES: GhostRule[] = [
  { id: 'dom-marker-strip', context: 'domMarker', match: { signature: 'data-ad' }, action: 'strip', preset: 'standard' },
  { id: 'dom-marker-google', context: 'domMarker', match: { signature: 'data-google' }, action: 'strip', preset: 'standard' },
  { id: 'global-teardown', context: 'global', match: { signature: 'adsbygoogle' }, action: 'teardown', preset: 'standard' },
];

export const AGGRESSIVE_RULES: GhostRule[] = [
  ...STANDARD_RULES,
  { id: 'pm-redact', context: 'postMessage', match: { signature: 'adSlot' }, action: 'redact', fields: ['slotId', 'impressionId', 'clientId'], preset: 'aggressive' },
  { id: 'fetch-redact', context: 'fetch', match: { signature: '/api/ad/' }, action: 'redact', fields: ['slotId'], preset: 'aggressive' },
];

export const PARANOID_RULES: GhostRule[] = [
  ...AGGRESSIVE_RULES,
  { id: 'beacon-strip', context: 'beacon', match: { signature: 'ad' }, action: 'strip', preset: 'paranoid' },
];

export function rulesForPreset(preset: Preset): GhostRule[] {
  if (preset === 'standard') return [...STANDARD_RULES];
  if (preset === 'aggressive') return [...AGGRESSIVE_RULES];
  return [...PARANOID_RULES];
}

export function loadRules(preset: Preset): GhostRule[] {
  return rulesForPreset(preset);
}
