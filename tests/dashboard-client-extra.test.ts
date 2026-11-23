// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../src/dashboard-client.js';
import type { AdStage, FarBuffShieldApi, StatsSnapshot } from '../src/types.js';

const HIDE_SELECTORS = '[data-ad-surface],[data-ad]';

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
    byStage: { inventory: 0, bid: 0, policy: 0, media: 0, delivery: 0, promo: 0 },
    bySurface: {
      sponsorBreak: 0, billboard: 0, intermission: 0, spotlight: 0, showcase: 0,
      sponsoredTask: 0, sponsoredRun: 0, partner: 0, invitation: 0, sponsoredCard: 0,
    },
    byEndpoint: {},
    recent: [],
    perMinute: [],
    perSurfaceMinute: { sponsorBreak: [], billboard: [], intermission: [], spotlight: [], showcase: [], sponsoredTask: [], sponsoredRun: [], partner: [], invitation: [], sponsoredCard: [] },
  };
}

function shadowEl(sel: string): HTMLElement {
  const host = document.querySelector('#far-shield-host');
  const found = host?.shadowRoot?.querySelector(sel);
  if (!found) throw new Error(`shadow element not found: ${sel}`);
  return found as HTMLElement;
}

function hostEl(): HTMLElement {
  const host = document.querySelector('#far-shield-host');
  if (!host) throw new Error('host not found');
  return host as HTMLElement;
}

interface RadarBlip { stage: number; angle: number; radius: number; born: number }
interface ShieldRegistry { radar: { blips: RadarBlip[]; sweep: number } }

function registry(): ShieldRegistry {
  return (hostEl() as unknown as { __farShield: ShieldRegistry }).__farShield;
}

const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 10); });

function fakeCtx(): unknown {
  const gradient = { addColorStop: vi.fn() };
  const target: Record<string, unknown> = { createRadialGradient: () => gradient };
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop as string];
      return () => {};
    },
    set(t, prop, value) {
      t[prop as string] = value;
      return true;
    },
  });
}

describe('dashboard client extra', () => {
  let rafQueue = new Map<number, FrameRequestCallback>();
  let rafSeq = 0;
  let rafSpy: ReturnType<typeof vi.fn>;
  let cafSpy: ReturnType<typeof vi.fn>;
  let ctxSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    rafQueue = new Map();
    rafSeq = 0;
    rafSpy = vi.fn((cb: FrameRequestCallback) => {
      rafSeq += 1;
      rafQueue.set(rafSeq, cb);
      return rafSeq;
    });
    cafSpy = vi.fn((id: number) => { rafQueue.delete(id); });
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', cafSpy);
    ctxSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx() as never);
  });

  afterEach(() => {
    api().unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function pump(times: number[]): void {
    for (const t of times) {
      const cbs = [...rafQueue.values()];
      rafQueue.clear();
      for (const cb of cbs) cb(t);
    }
  }

  function sizeRadar(width: number): void {
    const box = shadowEl('[data-f="radarBox"]');
    Object.defineProperty(box, 'offsetWidth', { value: width, configurable: true });
  }

  it('reports closed when nothing is installed', () => {
    expect(api().isOpen()).toBe(false);
    expect(() => { api().unmount(); }).not.toThrow();
  });

  it('draws the radar dial and bearing wedges while the panel is open', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 4;
    snap.byStage.media = 3;
    snap.byStage.delivery = 1;
    api().update(snap);
    sizeRadar(120);

    shadowEl('.badge').click();
    expect(api().isOpen()).toBe(true);
    expect(rafSpy).toHaveBeenCalled();

    pump([16, 32, 48]);
    expect(rafQueue.size).toBe(1);
    // The canvas got a backing store fitted to the layout box.
    const canvas = shadowEl('[data-f="radar"]') as HTMLCanvasElement;
    expect(canvas.width).toBe(120);
    expect(canvas.height).toBe(120);
  });

  it('draws blips and exercises the fade, halo and sweep branches', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    api().update(emptySnapshot());
    sizeRadar(120);
    shadowEl('.badge').click();

    const st = registry();
    const now = 1_000_000;
    st.radar.blips.push(
      { stage: 0, angle: st.radar.sweep, radius: 0.5, born: now - 1000 },
      { stage: 1, angle: st.radar.sweep + Math.PI, radius: 0.5, born: now - 1000 },
      { stage: 2, angle: 0, radius: 0.5, born: now },
      { stage: 3, angle: 0, radius: 0.5, born: now + 5000 },
    );
    pump([now, now + 16]);
    // The future blip is kept by the filter but skipped by drawRadar.
    expect(st.radar.blips.length).toBe(4);
  });

  it('stops the loop when the panel closes and when the ledger view is active', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    sizeRadar(120);
    shadowEl('.badge').click();
    pump([16]);
    expect(rafQueue.size).toBe(1);

    shadowEl('.badge').click();
    expect(api().isOpen()).toBe(false);
    pump([32]);
    expect(rafQueue.size).toBe(0);
    expect(cafSpy).toHaveBeenCalled();

    shadowEl('.badge').click();
    pump([48]);
    expect(rafQueue.size).toBe(1);
    shadowEl('[data-view-btn="ledger"]').click();
    pump([64]);
    expect(rafQueue.size).toBe(0);

    shadowEl('[data-view-btn="radar"]').click();
    pump([80]);
    expect(rafQueue.size).toBe(1);
  });

  it('re-uses a running loop when the radar tab is reselected', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    sizeRadar(120);
    shadowEl('.badge').click();
    pump([16]);
    const before = rafSpy.mock.calls.length;
    shadowEl('[data-view-btn="radar"]').click();
    expect(rafSpy.mock.calls.length).toBe(before);
  });

  it('keeps the loop armed without drawing while the document is hidden', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    sizeRadar(120);
    shadowEl('.badge').click();
    pump([16]);
    expect(rafQueue.size).toBe(1);

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    pump([32, 48]);
    expect(rafQueue.size).toBe(1);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    pump([64]);
    expect(rafQueue.size).toBe(1);
  });

  it('skips layout work when the radar box is detached or zero-sized', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    shadowEl('.badge').click();
    // Zero width: syncRadar returns before fitting the canvas.
    sizeRadar(0);
    pump([16]);
    expect((shadowEl('[data-f="radar"]') as HTMLCanvasElement).width).toBe(168);

    // Detached box: isConnected is false.
    const canvas = shadowEl('[data-f="radar"]') as HTMLCanvasElement;
    const before = canvas.width;
    const detached = hostEl();
    detached.remove();
    pump([32]);
    expect(canvas.width).toBe(before);
    document.body.appendChild(detached);
  });

  it('re-fits the canvas only when the size or dpr changes', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    sizeRadar(120);
    shadowEl('.badge').click();
    pump([16]);
    const canvas = shadowEl('[data-f="radar"]') as HTMLCanvasElement;
    expect(canvas.width).toBe(120);

    pump([32]);
    expect(canvas.width).toBe(120);
  });

  it('renders the heat grid from per-minute buckets', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    const minute = 5_000;
    snap.at = minute * 60_000;
    snap.perMinute = [{ minute, count: 7 }, { minute: minute - 1, count: 1 }];
    api().update(snap);
    const cells = shadowEl('[data-f="heat"]').querySelectorAll('i');
    expect(cells).toHaveLength(30);
    const lit = [...cells].filter((c) => (c).title);
    expect(lit).toHaveLength(2);
    expect(lit.map((c) => c.getAttribute('title')).join(',')).toContain('7 at');
  });

  it('falls back to a neutral stage colour for an unknown stage', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const snap = emptySnapshot();
    snap.total = 1;
    snap.recent = [{ stage: 'bogus' as AdStage, surface: 'billboard', endpoint: '', at: Date.UTC(2026, 0, 1, 1, 2, 3) }];
    api().update(snap);
    const dot = shadowEl('.events').querySelector('.event-dot') as HTMLElement;
    expect(dot.style.background).toBe('rgb(154, 163, 181)');
    expect(shadowEl('.events').querySelector('.event-pill')?.textContent).toBe('');
  });

  it('ignores view clicks that do not land on a tab button', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    shadowEl('.badge').click();
    const pseg = shadowEl('[data-f="pseg"]');
    pseg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(shadowEl('.panel').getAttribute('data-view')).toBe('radar');
  });

  it('switches views with arrow keys and moves focus', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    shadowEl('.badge').click();
    const pseg = shadowEl('[data-f="pseg"]');
    pseg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(shadowEl('.panel').getAttribute('data-view')).toBe('ledger');
    pseg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(shadowEl('.panel').getAttribute('data-view')).toBe('radar');
    pseg.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(shadowEl('.panel').getAttribute('data-view')).toBe('radar');
  });

  it('closes from the close button and returns focus to the badge', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    shadowEl('.badge').click();
    expect(api().isOpen()).toBe(true);
    shadowEl('.p-close').click();
    expect(api().isOpen()).toBe(false);
    expect(document.activeElement).toBe(hostEl());
    expect(hostEl().shadowRoot?.activeElement).toBe(shadowEl('.badge'));
  });

  it('does not count DOM nodes when no selectors are installed', async () => {
    api().install({ hideSelectors: '' });
    const node = document.createElement('div');
    node.setAttribute('data-ad-surface', 'billboard');
    document.body.appendChild(node);
    document.body.appendChild(document.createTextNode('text'));
    await flush();
    expect(shadowEl('.dom-hidden').textContent).toBe('0 hidden in page');
  });

  it('does not double-count a nested node that is re-added', async () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const wrapper = document.createElement('div');
    const nested = document.createElement('i');
    nested.setAttribute('data-ad-surface', 'billboard');
    wrapper.appendChild(nested);
    document.body.appendChild(wrapper);
    await flush();
    expect(shadowEl('.dom-hidden').textContent).toContain('1');

    wrapper.remove();
    document.body.appendChild(wrapper);
    await flush();
    expect(shadowEl('.dom-hidden').textContent).toContain('1');
  });

  it('drops a leftover host that carries no registry', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    const host = hostEl() as unknown as Record<string, unknown>;
    delete host.__farShield;
    api().install({ hideSelectors: HIDE_SELECTORS });
    expect(document.querySelectorAll('#far-shield-host')).toHaveLength(1);
    expect(registry()).not.toBeNull();
  });

  it('draws nothing when the canvas context is unavailable', () => {
    ctxSpy.mockImplementation(() => null as never);
    api().install({ hideSelectors: HIDE_SELECTORS });
    sizeRadar(120);
    shadowEl('.badge').click();
    const canvas = shadowEl('[data-f="radar"]') as HTMLCanvasElement;
    pump([16]);
    expect(canvas.width).toBe(120);
    expect(rafQueue.size).toBe(1);
  });
});
