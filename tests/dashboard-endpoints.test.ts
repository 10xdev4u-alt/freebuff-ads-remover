// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/dashboard-client.js';
import { AD_CSS_SELECTORS } from '../src/types.js';
import type { FarBuffShieldApi, StatsSnapshot } from '../src/types.js';
import { sanitizePageClient, smokeTestPageClient } from '../scripts/page-client-guard.mjs';

const HIDE_SELECTORS = Object.values(AD_CSS_SELECTORS).flat().join(',');

function api(): FarBuffShieldApi {
  const client = (globalThis as { farBuffShield?: FarBuffShieldApi }).farBuffShield;
  if (!client) throw new Error('dashboard client did not register');
  return client;
}

function emptySnapshot(byEndpoint: Record<string, number> = {}): StatsSnapshot {
  const snapshot: StatsSnapshot = {
    total: 0, at: 0, startedAt: 0,
    byStage: { inventory: 0, bid: 0, policy: 0, media: 0, delivery: 0, promo: 0 },
    bySurface: {
      sponsorBreak: 0, billboard: 0, intermission: 0, spotlight: 0, showcase: 0,
      sponsoredTask: 0, sponsoredRun: 0, partner: 0, invitation: 0, sponsoredCard: 0,
    },
    byEndpoint,
    recent: [], perMinute: [],
    perSurfaceMinute: {
      sponsorBreak: [], billboard: [], intermission: [], spotlight: [], showcase: [],
      sponsoredTask: [], sponsoredRun: [], partner: [], invitation: [], sponsoredCard: [],
    },
  };
  return snapshot;
}

function shadowEl(sel: string): HTMLElement {
  const found = document.querySelector('#far-shield-host')?.shadowRoot?.querySelector(sel);
  if (!found) throw new Error(`shadow element not found: ${sel}`);
  return found as HTMLElement;
}

function rows(): HTMLElement[] {
  const host = document.querySelector('#far-shield-host');
  return Array.from(host?.shadowRoot?.querySelectorAll<HTMLElement>('.endpoints .endpoint-row') ?? []);
}

beforeEach(() => {
  document.body.innerHTML = '';
  api().install({ hideSelectors: HIDE_SELECTORS });
});

afterEach(() => { api().unmount(); });

describe('top blocked endpoints', () => {
  it('renders an empty state when byEndpoint is empty', () => {
    api().update(emptySnapshot());
    expect(rows()).toHaveLength(0);
    const empty = shadowEl('.endpoints .empty');
    expect(empty.textContent).toMatch(/endpoint/i);
  });

  it('excludes zero-count endpoint entries', () => {
    api().update(emptySnapshot({ '/api/ad/a': 0, '/api/ad/b': 2 }));
    const found = rows();
    expect(found).toHaveLength(1);
    expect(found[0]?.getAttribute('data-endpoint')).toBe('/api/ad/b');
  });

  it('orders endpoints by descending count with stable ties', () => {
    api().update(emptySnapshot({ '/api/ad/c': 3, '/api/ad/a': 5, '/api/ad/b': 5, '/api/ad/d': 1 }));
    const found = rows();
    expect(found.map((r) => r.getAttribute('data-endpoint'))).toEqual([
      '/api/ad/a', '/api/ad/b', '/api/ad/c', '/api/ad/d',
    ]);
    expect(found.map((r) => r.querySelector('.endpoint-count')?.textContent)).toEqual(['5', '5', '3', '1']);
  });

  it('truncates to the top six endpoints', () => {
    const byEndpoint = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`/api/ad/e${String(9 - i)}`, 9 - i]),
    );
    api().update(emptySnapshot(byEndpoint));
    const found = rows();
    expect(found).toHaveLength(6);
    expect(found.map((r) => r.querySelector('.endpoint-count')?.textContent)).toEqual([
      '9', '8', '7', '6', '5', '4',
    ]);
    expect(found.some((r) => r.getAttribute('data-endpoint') === '/api/ad/e3')).toBe(false);
  });

  it('renders endpoint labels as inert text', () => {
    api().update(emptySnapshot({
      '/api/ad/<img src=x onerror=alert(1)>': 4,
      '/api/ad/"q"&amp': 2,
    }));
    const names = rows().map((r) => r.querySelector('.endpoint-name')?.textContent);
    expect(names).toContain('<img src=x onerror=alert(1)>');
    expect(names).toContain('"q"&amp');
    const root = document.querySelector('#far-shield-host')?.shadowRoot;
    expect(root?.querySelector('img')).toBeNull();
    expect(root?.querySelector('[onerror]')).toBeNull();
  });

  it('rebinds the endpoint list across repeated updates', () => {
    api().update(emptySnapshot({ '/api/ad/a': 2 }));
    api().update(emptySnapshot({ '/api/ad/b': 7 }));
    const found = rows();
    expect(found).toHaveLength(1);
    expect(found[0]?.getAttribute('data-endpoint')).toBe('/api/ad/b');
  });
});

describe('endpoint list code is page-safe', () => {
  const BODY = [
    '(() => {',
    '  const api = { install() {',
    '    const list = document.createElement("ul");',
    '    for (const [name, count] of Object.entries({ "/api/ad/a": 2 })) {',
    '      const row = document.createElement("li");',
    '      const label = document.createElement("span");',
    '      label.textContent = name;',
    '      row.setAttribute("data-endpoint", name);',
    '      row.appendChild(label);',
    '      row.appendChild(document.createTextNode(String(count)));',
    '      list.appendChild(row);',
    '    }',
    '  }, update() {}, unmount() {}, isOpen() { return false; } };',
    '  globalThis.farBuffShield = api;',
    '})();',
  ].join('\n');

  it('accepts browser-only rendering and rejects Node shortcuts', async () => {
    const clean = sanitizePageClient(BODY);
    expect(clean.findings).toEqual([]);
    expect(await smokeTestPageClient(clean.code)).toEqual({ ok: true });
    for (const [snippet, name] of [
      ['process.env.X;', 'process'],
      ['Buffer.from("x");', 'Buffer'],
      ['require("fs");', 'require'],
      ['module.exports = {};', 'module'],
      ['export function f(){}', 'export declaration'],
      ["import fs from 'fs';", 'import declaration'],
      ["globalThis.require('fs');", 'globalThis.require'],
    ]) {
      expect(sanitizePageClient(`${BODY}\n${String(snippet)}`).findings.join(' '), String(name)).toMatch(
        new RegExp(String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      );
    }
  });
});
