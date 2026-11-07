import { describe, it, expect } from 'vitest';
import { buildDomRemoverScript, buildDomRemoverFromSelectors } from '../src/dom-remover.js';

describe('dom-remover', () => {
  it('builds a self-contained IIFE', () => {
    const s = buildDomRemoverScript({ selectors: ['.ad-x', '[class*="sponsor"]'], debug: false });
    expect(s).toContain('__farBuffDomRemover');
    expect(s).toContain('MutationObserver');
    expect(s).toContain('.ad-x');
  });

  it('is idempotent-guarded', () => {
    const s = buildDomRemoverScript({ selectors: ['.a'], debug: false });
    expect(s).toMatch(/var GUARD = '__farBuffDomRemover_v' \+ VERSION;/);
  });

  it('builds from selectors map without throwing', () => {
    const s = buildDomRemoverFromSelectors();
    expect(s.length).toBeGreaterThan(100);
    expect(s).toContain('removeChild');
  });

  it('escapes selectors safely via JSON', () => {
    const s = buildDomRemoverScript({ selectors: ['a"b'], debug: false });
    const m = s.match(/var selectors = (\[.*?\]);/s);
    const raw = m ? String(m[1]) : '[]';
    expect(() => { JSON.parse(raw); }).not.toThrow();
  });
});
