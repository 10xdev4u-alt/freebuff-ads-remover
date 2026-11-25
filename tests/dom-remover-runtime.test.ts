// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildDomRemoverScript } from '../src/dom-remover.js';

interface Armor {
  version: number;
  stats: { removed: number; passes: number };
  removeNow(): void;
  teardown(): void;
}

const armor = (): Armor | undefined => (window as unknown as { __farBuffDomArmor?: Armor }).__farBuffDomArmor;
const script = (selectors: string[]) => buildDomRemoverScript({ selectors, debug: false });

function arm(selectors: string[]): Armor {
  window.eval(script(selectors));
  const api = armor();
  if (!api) throw new Error('DomArmor did not arm');
  return api;
}

function ad(className = 'ad'): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

const flush = (ms = 30) => new Promise<void>((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  armor()?.teardown();
  const bag = window as unknown as Record<string, unknown>;
  delete bag.__farBuffDomArmor;
  delete bag.__farBuffDomArmor_v3;
});

describe('DomArmor runtime lifecycle', () => {
  it('removes initial and dynamically added ad nodes', async () => {
    const api = arm(['.ad']);
    const first = ad();
    document.body.appendChild(first);
    await flush();
    expect(first.parentNode).toBeNull();
    expect(api.stats.removed).toBe(1);

    const second = ad();
    document.body.appendChild(second);
    await flush();
    expect(second.parentNode).toBeNull();
    expect(api.stats.removed).toBe(2);
  });

  it('does not let a torn-down instance act after popstate', async () => {
    const api = arm(['.old']);
    await flush();
    const before = api.stats.passes;
    api.teardown();

    const stale = ad('old');
    document.body.appendChild(stale);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();

    expect(armor()).toBeUndefined();
    expect(api.stats.passes).toBe(before);
    expect(stale.parentNode).not.toBeNull();
  });

  it('does not leak behavior across two different injected configs', async () => {
    const first = arm(['.first']);
    first.teardown();
    const second = arm(['.second']);
    const stale = ad('first');
    const fresh = ad('second');
    document.body.appendChild(stale);
    document.body.appendChild(fresh);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();

    expect(stale.parentNode).not.toBeNull();
    expect(fresh.parentNode).toBeNull();
    expect(second.stats.removed).toBe(1);
  });

  it('does not throw when a host exposes a throwing shadowRoot query', () => {
    const host = document.createElement('div');
    Object.defineProperty(host, 'shadowRoot', {
      value: { querySelectorAll: () => { throw new Error('boom'); } },
    });
    document.body.appendChild(host);
    const valid = ad();
    document.body.appendChild(valid);
    const api = arm(['.ad']);

    expect(() => { api.removeNow(); }).not.toThrow();
    expect(valid.parentNode).toBeNull();
  });

  it('keeps the guard version in sync with the iframe test', () => {
    expect(arm(['.ad']).version).toBe(3);
  });
});
