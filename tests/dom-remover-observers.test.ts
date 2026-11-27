// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { buildDomRemoverScript } from '../src/dom-remover.js';

interface Armor { removeNow(): void; teardown(): void }
const observed: Node[] = [];

class CountingObserver {
  observe(target: Node): void { observed.push(target); }
  disconnect(): void {}
  takeRecords(): MutationRecord[] { return []; }
}

function arm(): Armor {
  window.eval(buildDomRemoverScript({ selectors: ['.ad'], debug: false }));
  const api = (window as unknown as { __farBuffDomArmor?: Armor }).__farBuffDomArmor;
  if (!api) throw new Error('DomArmor did not arm');
  return api;
}

afterEach(() => {
  (window as unknown as { __farBuffDomArmor?: Armor }).__farBuffDomArmor?.teardown();
  delete (window as unknown as Record<string, unknown>).__farBuffDomArmor;
  delete (window as unknown as Record<string, unknown>).__farBuffDomArmor_v3;
  vi.unstubAllGlobals();
  observed.length = 0;
  document.body.innerHTML = '';
});

describe('DomArmor iframe observers', () => {
  it('observes an iframe document once across repeated sweeps', () => {
    vi.stubGlobal('MutationObserver', CountingObserver);
    const api = arm();
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    expect(doc).not.toBeNull();

    api.removeNow();
    expect(observed.filter((target) => target === doc).length).toBeGreaterThan(0);
    observed.length = 0;

    api.removeNow();
    api.removeNow();
    api.removeNow();
    expect(observed.filter((target) => target === doc)).toHaveLength(0);
  });
});
