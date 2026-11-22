import { describe, it, expect } from 'vitest';
import { buildDomRemoverScript, buildDomRemoverFromSelectors } from '../src/dom-remover.js';

describe('dom-remover', () => {
  it('builds a self-contained IIFE', () => {
    const s = buildDomRemoverScript({ selectors: ['.ad-x', '[class*="sponsor"]'], debug: false });
    expect(s).toContain('__farBuffDomArmor');
    expect(s).toContain('MutationObserver');
    expect(s).toContain('.ad-x');
  });

  it('is idempotent-guarded', () => {
    const s = buildDomRemoverScript({ selectors: ['.a'], debug: false });
    expect(s).toMatch(/var GUARD = '__farBuffDomArmor_v' \+ VERSION;/);
  });

  it('builds from selectors map without throwing', () => {
    const s = buildDomRemoverFromSelectors();
    expect(s.length).toBeGreaterThan(100);
    expect(s).toContain('removeChild');
  });

  it('derives selectors from the registry, not a hardcoded list', () => {
    const s = buildDomRemoverFromSelectors();
    const m = s.match(/var selectors = (\[.*?\]);/s);
    const selectors = JSON.parse(String(m ? m[1] : '[]')) as string[];
    expect(selectors).toContain('[class*="sponsorBreak"]');
    expect(selectors).toContain('a.sponsored-ad');
    expect(selectors).toContain('[data-ad-surface="billboard"]');
    expect(selectors).toContain('.ad-content');
  });

  it('escapes selectors safely via JSON', () => {
    const s = buildDomRemoverScript({ selectors: ['a"b'], debug: false });
    const m = s.match(/var selectors = (\[.*?\]);/s);
    const raw = m ? String(m[1]) : '[]';
    expect(() => { JSON.parse(raw); }).not.toThrow();
  });
});
