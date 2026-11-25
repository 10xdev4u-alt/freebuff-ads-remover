import { describe, it, expect } from 'vitest';
import { AdInterceptor } from '../src/interceptor.js';
import { Logger } from '../src/logger.js';
import { canonicalize, matchRoute } from '../src/url-match.js';
import {
  AD_ENDPOINTS,
  AD_STAGES,
  DEFAULT_CONFIG,
  stageForEndpoint,
} from '../src/types.js';

/** Deterministic PRNG — reproducible failures without Math.random. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(next: () => number, items: readonly T[]): T =>
  items[Math.floor(next() * items.length)]!;

const NOISE = ['', 'x', 'API', 'ad', 'café', '日本語', '🚀', '%ZZ', '%2F', '%61', '//', '-', '_'];
const QUERY = ['?x=1&y=2', '?y=2&x=1', '?placement=home', ''];
const ORIGIN = 'https://freebuff.com';

function generated(seed: number, count: number): string[] {
  const next = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const parts = Array.from({ length: 2 + Math.floor(next() * 4) }, () => pick(next, NOISE));
    out.push(`/api/${parts.join('/')}${pick(next, QUERY)}`);
  }
  return out;
}

const interceptor = () => new AdInterceptor(DEFAULT_CONFIG, new Logger('error', false));

function transforms(path: string): string[] {
  return [
    path,
    path.replace('/api/', '/API/'),
    path.replace('/api/', '/api//'),
    `${path}?placement=home&x=1`,
    `${path}?x=1&placement=home`,
    path.replace('/ad/', '/%61d/'),
  ];
}

describe('seeded URL/intercept properties', () => {
  it('the generator is deterministic and keeps independent state', () => {
    const a = rng(0x5eed);
    const b = rng(0x5eed);
    const a1 = Array.from({ length: 8 }, () => a());
    const b1 = b();
    const a2 = Array.from({ length: 4 }, () => a());
    const b2 = Array.from({ length: 11 }, () => b());
    expect([...a1, ...a2]).toEqual([b1, ...b2]);
  });

  const cases = generated(0x5eed, 250);

  it('every generated input is handled without throwing', () => {
    const i = interceptor();
    for (const raw of cases) {
      expect(() => { stageForEndpoint(raw); }, raw).not.toThrow();
      expect(() => { canonicalize(raw); }, raw).not.toThrow();
      expect(() => { matchRoute(raw, '/api/ad/break'); }, raw).not.toThrow();
      expect(() => { i.intercept(raw); }, raw).not.toThrow();
      expect(() => { i.isAdUrl(raw); }, raw).not.toThrow();
      const stage = stageForEndpoint(raw);
      expect(AD_STAGES).toContain(stage);
    }
  });

  it('canonicalize is idempotent for parseable absolute URLs', () => {
    for (const raw of cases) {
      let absolute: string;
      try { absolute = new URL(raw, ORIGIN).toString(); } catch { continue; }
      const once = canonicalize(absolute);
      expect(canonicalize(once), once).toBe(once);
    }
  });

  it('path-only matching survives case, duplicate slashes and query changes', () => {
    for (const endpoint of AD_ENDPOINTS) {
      const base = ORIGIN + endpoint;
      const expected = matchRoute(base, endpoint);
      expect(expected, endpoint).toBe(true);
      for (const variant of transforms(endpoint)) {
        expect(matchRoute(ORIGIN + variant, endpoint), `${endpoint} -> ${variant}`).toBe(true);
      }
    }
  });

  it('query order does not change an absolute-pattern match', () => {
    const pattern = `${ORIGIN}/api/ad/break?a=1&b=2`;
    expect(matchRoute(`${ORIGIN}/api/ad/break?a=1&b=2`, pattern)).toBe(true);
    expect(matchRoute(`${ORIGIN}/api/ad/break?b=2&a=1`, pattern)).toBe(true);
  });

  it('stage specificity holds for neutral prefixes and suffixes', () => {
    for (const endpoint of AD_ENDPOINTS) {
      const expected = stageForEndpoint(endpoint);
      expect(stageForEndpoint(`/neutral${endpoint}`), endpoint).toBe(expected);
      expect(stageForEndpoint(`${endpoint}neutral`), endpoint).toBe(expected);
    }
  });

  it('intercepted stages agree with stageForEndpoint under normalization', () => {
    const i = interceptor();
    for (const endpoint of AD_ENDPOINTS) {
      const stage = stageForEndpoint(endpoint);
      for (const variant of transforms(endpoint)) {
        const result = i.intercept(ORIGIN + variant);
        expect(result.blocked, `${endpoint} -> ${variant}`).toBe(true);
        expect(result.endpoint, `${endpoint} -> ${variant}`).toBe(endpoint);
        expect(result.stage, `${endpoint} -> ${variant}`).toBe(stage);
      }
    }
  });

  it('neutral paths are not blocked and fall back to the inventory stage', () => {
    const i = interceptor();
    const next = rng(0xc0ffee);
    const neutral = ['chat', 'account', 'health', 'usage', 'profile', 'settings', 'healthz'];
    for (let n = 0; n < 100; n += 1) {
      const path = `/api/${pick(next, neutral)}/${pick(next, neutral)}`;
      if (AD_ENDPOINTS.some((e) => path.includes(e))) continue;
      expect(stageForEndpoint(path), path).toBe('inventory');
      expect(i.intercept(ORIGIN + path).blocked, path).toBe(false);
      expect(i.isAdUrl(ORIGIN + path), path).toBe(false);
    }
  });

  it('does not match an ad endpoint that appears only in a query value', () => {
    for (const raw of [
      '/api/chat?next=/api/ad/break',
      '/api/chat?q=%2Fapi%2Fad%2Fpolicy',
      '/api/chat#/api/ad/break',
    ]) {
      for (const e of AD_ENDPOINTS) {
        expect(matchRoute(raw, e), `${raw} vs ${e}`).toBe(matchRoute(ORIGIN + raw, e));
      }
    }
    expect(matchRoute('/api/ad/break?x=1', '/api/ad/break')).toBe(true);
    expect(interceptor().intercept('/api/chat?next=/api/ad/break').blocked).toBe(false);
  });

  it('stageForEndpoint is invariant under the same normalizations as matching', () => {
    for (const endpoint of AD_ENDPOINTS) {
      const expected = stageForEndpoint(endpoint);
      const variants = [
        endpoint.toUpperCase(),
        endpoint.replace('/api/', '/api//'),
        endpoint.replace('/ad/', '/%61d/'),
        `${endpoint}?x=1`,
      ];
      for (const variant of variants) {
        expect(stageForEndpoint(variant), `${endpoint} -> ${variant}`).toBe(expected);
      }
    }
  });
});
