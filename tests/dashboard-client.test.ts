// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import '../src/dashboard-client.js';
import { AD_CSS_SELECTORS, AD_STAGES } from '../src/types.js';
import type { FarBuffShieldApi, StatsSnapshot } from '../src/types.js';

const HIDE_SELECTORS = Object.values(AD_CSS_SELECTORS).flat().join(',');

function api(): FarBuffShieldApi {
  const client = (globalThis as { farBuffShield?: FarBuffShieldApi }).farBuffShield;
  if (!client) throw new Error('dashboard client did not register');
  return client;
}

function emptySnapshot(): StatsSnapshot {
  return {
    total: 0,
    at: 0,
    startedAt: 0,
    byStage: {
      inventory: 0,
      bid: 0,
      policy: 0,
      media: 0,
      delivery: 0,
      promo: 0,
    },
    bySurface: {
      sponsorBreak: 0,
      billboard: 0,
      intermission: 0,
      spotlight: 0,
      showcase: 0,
      sponsoredTask: 0,
      sponsoredRun: 0,
      partner: 0,
      invitation: 0,
      sponsoredCard: 0,
    },
    byEndpoint: {},
    recent: [],
    perMinute: [],
  };
}

function el(sel: string): HTMLElement {
  const found = document.querySelector(sel);
  if (!found) throw new Error(`element not found: ${sel}`);
  return found as HTMLElement;
}

function shadowEl(sel: string): HTMLElement {
  const host = document.querySelector('#far-shield-host');
  const root = host?.shadowRoot;
  const found = root?.querySelector(sel);
  if (!found) throw new Error(`shadow element not found: ${sel}`);
  return found as HTMLElement;
}

const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 10); });

describe('dashboard client', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('installs a shadow host and registers the api', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const host = document.querySelector('#far-shield-host');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
    expect(api().isOpen()).toBe(false);
  });

  it('is idempotent: installing twice keeps one host', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    api().install({ hideSelectors: HIDE_SELECTORS });
    expect(document.querySelectorAll('#far-shield-host')).toHaveLength(1);
  });

  it('re-mounts when the host was removed from the page', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 3;
    api().update(snap);
    el('#far-shield-host').remove();
    api().update(snap);
    expect(document.querySelectorAll('#far-shield-host')).toHaveLength(1);
    expect(shadowEl('.badge-count').textContent).toBe('3');
  });

  it('toggles the panel via the badge', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const panel = shadowEl('.panel');
    expect(panel.hasAttribute('hidden')).toBe(true);

    shadowEl('.badge').click();
    expect(api().isOpen()).toBe(true);
    expect(panel.hasAttribute('hidden')).toBe(false);

    shadowEl('.badge').click();
    expect(api().isOpen()).toBe(false);
    expect(panel.hasAttribute('hidden')).toBe(true);
  });

  it('renders totals on badge, header and stage pipeline', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 7;
    snap.byStage.inventory = 3;
    snap.byStage.delivery = 4;
    api().update(snap);

    expect(shadowEl('.badge-count').textContent).toBe('7');
    expect(shadowEl('.header-total').textContent).toContain('7');
    expect(shadowEl('[data-stage="inventory"] .stage-count').textContent).toBe('3');
    expect(shadowEl('[data-stage="delivery"] .stage-count').textContent).toBe('4');
    expect(shadowEl('[data-stage="policy"] .stage-count').textContent).toBe('0');
    expect(shadowEl('[data-stage="promo"]')).not.toBeNull();
  });

  it('marks the badge as pulsing when the total grows', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 1;
    api().update(snap);
    expect(shadowEl('.badge').classList.contains('pulse')).toBe(true);
  });

  it('flashes the pipeline node whose stage count grew', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 1;
    snap.byStage.media = 1;
    api().update(snap);
    expect(shadowEl('[data-stage="media"]').classList.contains('hit')).toBe(true);
    expect(shadowEl('[data-stage="bid"]').classList.contains('hit')).toBe(false);
  });

  it('lists top surfaces with bars, sorted by count', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 5;
    snap.bySurface.billboard = 5;
    snap.bySurface.partner = 2;
    api().update(snap);

    const rows = document
      .querySelector('#far-shield-host')
      ?.shadowRoot
      ?.querySelectorAll('.surface-row');
    expect(rows).toHaveLength(2);
    expect(rows?.[0]?.getAttribute('data-surface')).toBe('billboard');
    expect(rows?.[1]?.getAttribute('data-surface')).toBe('partner');
    expect(rows?.[0]?.querySelector('.surface-count')?.textContent).toBe('5');
    const fill = rows?.[0]?.querySelector('.surface-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('shows an empty state when nothing was blocked yet', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    api().update(emptySnapshot());
    expect(shadowEl('.events').textContent).toContain('watching');
  });

  it('renders recent events newest first with stage dot and time', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 2;
    snap.byStage.delivery = 2;
    snap.recent = [
      { stage: 'delivery', surface: 'sponsorBreak', endpoint: '/api/ad/impression', at: Date.UTC(2026, 0, 1, 12, 0, 5) },
      { stage: 'policy', surface: 'sponsorBreak', endpoint: '/api/ad/policy', at: Date.UTC(2026, 0, 1, 12, 0, 1) },
    ];
    api().update(snap);

    const items = shadowEl('.events').querySelectorAll('.event');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('impression');
    expect(items[1]?.textContent).toContain('policy');
    expect(items[0]?.classList.contains('enter')).toBe(true);
    expect(items[0]?.querySelector('.event-dot')?.getAttribute('data-stage')).toBe('delivery');
  });

  it('ignores updates before install', () => {
    expect(() => {
      api().update(emptySnapshot());
    }).not.toThrow();
  });

  it('counts matching DOM nodes added after install', async () => {
    api().install({ hideSelectors: HIDE_SELECTORS });

    const direct = document.createElement('div');
    direct.setAttribute('data-ad-surface', 'billboard');
    document.body.appendChild(direct);

    const wrapper = document.createElement('section');
    const nested = document.createElement('i');
    nested.setAttribute('data-ad-surface', 'partner');
    wrapper.appendChild(nested);
    document.body.appendChild(wrapper);

    await flush();
    expect(shadowEl('.dom-hidden').textContent).toContain('2');
  });

  it('does not double-count the same element re-added', async () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const node = document.createElement('div');
    node.setAttribute('data-ad-surface', 'billboard');
    document.body.appendChild(node);
    await flush();
    expect(shadowEl('.dom-hidden').textContent).toContain('1');

    node.remove();
    document.body.appendChild(node);
    await flush();
    expect(shadowEl('.dom-hidden').textContent).toContain('1');
  });

  it('adopts an existing host instead of double-mounting after re-injection', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    shadowEl('.badge').click();
    expect(api().isOpen()).toBe(true);

    api().install({ hideSelectors: HIDE_SELECTORS });
    expect(document.querySelectorAll('#far-shield-host')).toHaveLength(1);
    expect(api().isOpen()).toBe(true);
    expect(shadowEl('.badge-count')).not.toBeNull();
  });

  it('unmount removes the host and stops future updates', async () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 4;
    api().update(snap);
    expect(shadowEl('.badge-count').textContent).toBe('4');

    api().unmount();
    expect(document.querySelector('#far-shield-host')).toBeNull();

    const stray = document.createElement('div');
    stray.setAttribute('data-ad-surface', 'billboard');
    document.body.appendChild(stray);
    await flush();
    expect(document.querySelector('#far-shield-host')).toBeNull();

    api().update(snap);
    expect(document.querySelector('#far-shield-host')).toBeNull();
  });

  it('exposes the full stage set in the pipeline markup', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const nodes = shadowEl('.pipeline').querySelectorAll('.stage');
    expect(nodes).toHaveLength(6);
    const stages = [...nodes].map((n) => n.getAttribute('data-stage'));
    expect(stages).toEqual([...AD_STAGES]);
  });

  it('uses compact stage labels with full names as tooltips', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const nodes = shadowEl('.pipeline').querySelectorAll('.stage');
    const labels = [...nodes].map((n) => n.querySelector('.stage-label')?.textContent);
    expect(labels).toEqual(['Inv', 'Bid', 'Pol', 'Med', 'Dlv', 'Prm']);
    const titles = [...nodes].map((n) => n.getAttribute('title'));
    expect(titles).toEqual(['Inventory', 'Bid', 'Policy', 'Media', 'Delivery', 'Promo']);
  });

  it('renders a vector shield mark and zero emoji glyphs', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const host = document.querySelector('#far-shield-host');
    expect(host?.shadowRoot?.querySelectorAll('.mark svg')).toHaveLength(2);
    const html = host?.shadowRoot?.innerHTML ?? '';
    expect(html).not.toMatch(/🛡|&#x1F6E1;/);
    expect(html).toContain('<svg');
  });

  it('lights pipeline stages that have stops', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 2;
    snap.byStage.delivery = 2;
    api().update(snap);
    expect(shadowEl('[data-stage="delivery"]').classList.contains('lit')).toBe(true);
    expect(shadowEl('[data-stage="bid"]').classList.contains('lit')).toBe(false);

    snap.total = 0;
    snap.byStage.delivery = 0;
    api().update(snap);
    expect(shadowEl('[data-stage="delivery"]').classList.contains('lit')).toBe(false);
  });
});
