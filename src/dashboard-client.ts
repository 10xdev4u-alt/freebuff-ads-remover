import type { AdStage, FarBuffShieldApi, StatsSnapshot } from './types.js';

/**
 * Classic-script contract: this file may contain ONLY type imports and no
 * value exports. dist/dashboard-client.js is evaluated verbatim inside the
 * Freebuff page via webContents.executeJavaScript, so any emitted import or
 * export statement would be a syntax error in the page.
 */

(() => {
  'use strict';

  const HOST_ID = 'far-shield-host';

  interface StageMeta {
    id: AdStage;
    label: string;
    color: string;
  }

  const STAGE_META: StageMeta[] = [
    { id: 'inventory', label: 'Inv', color: '#9aa3b5' },
    { id: 'bid', label: 'Bid', color: '#f2b84b' },
    { id: 'policy', label: 'Pol', color: '#6aa8ff' },
    { id: 'media', label: 'Med', color: '#c084fc' },
    { id: 'delivery', label: 'Dlv', color: '#3ddc84' },
    { id: 'promo', label: 'Prm', color: '#ff7d9c' },
  ];

  const STAGE_TITLES: Record<AdStage, string> = {
    inventory: 'Inventory',
    bid: 'Bid',
    policy: 'Policy',
    media: 'Media',
    delivery: 'Delivery',
    promo: 'Promo',
  };

  const SHIELD_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<path d="M12 2.6 19.8 5.5v5.9c0 4.9-3.3 8.2-7.8 9.9-4.5-1.7-7.8-5-7.8-9.9V5.5L12 2.6z"'
    + ' stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
    + '<path d="M8.9 12.1l2.2 2.2 4-4.4" stroke="currentColor" stroke-width="1.8"'
    + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const CSS = `
:host {
  all: initial;
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483646;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.far-root { all: initial; display: block; color: #e8ebf1; }

.badge {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(150deg, #262a33 0%, #171a20 70%);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.07);
  cursor: pointer;
  padding: 0;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.badge:hover {
  transform: translateY(-1px);
  border-color: rgba(61, 220, 132, 0.5);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(61, 220, 132, 0.15);
}
.badge:focus-visible { outline: 2px solid #3ddc84; outline-offset: 2px; }
.mark { display: inline-flex; width: 22px; height: 22px; color: #c9d1de; }
.mark svg { width: 100%; height: 100%; display: block; }
.mark-sm { width: 15px; height: 15px; }
.badge-count {
  position: absolute;
  right: -5px;
  top: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #3ddc84;
  color: #06220f;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  font-variant-numeric: tabular-nums;
}
.badge.pulse { animation: far-pulse 0.55s ease; }
@keyframes far-pulse {
  0% { transform: scale(1); }
  35% { transform: scale(1.14); }
  100% { transform: scale(1); }
}

.panel {
  position: absolute;
  right: 0;
  bottom: 58px;
  width: 340px;
  max-height: 72vh;
  overflow: auto;
  background: linear-gradient(180deg, #1b1e25 0%, #14161b 100%);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  color: #e8ebf1;
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: far-in 0.18s ease;
  scrollbar-width: thin;
  scrollbar-color: #3a3f4b transparent;
}
.panel[hidden] { display: none; }
.panel::-webkit-scrollbar { width: 6px; }
.panel::-webkit-scrollbar-thumb { background: #3a3f4b; border-radius: 3px; }
@keyframes far-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 650;
  letter-spacing: 0.01em;
  color: #e8ebf1;
}
.header-title { display: flex; align-items: center; gap: 7px; }
.live {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #8b93a7;
  font-weight: 600;
}
.live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #3ddc84;
  box-shadow: 0 0 8px rgba(61, 220, 132, 0.9);
  animation: far-blink 1.6s infinite;
}
@keyframes far-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

.hero {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.header-total {
  font-size: 30px;
  line-height: 1;
  font-weight: 750;
  color: #3ddc84;
  font-variant-numeric: tabular-nums;
}
.hero-label { font-size: 11px; color: #8b93a7; }

.pipeline { display: flex; align-items: stretch; gap: 3px; margin-top: 2px; }
.stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 7px 1px 6px;
  border-radius: 10px;
  background: #101318;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.stage.lit { border-color: rgba(255, 255, 255, 0.12); background: #141821; }
.stage-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--stage-color, #9aa3b5);
  box-shadow: 0 0 7px var(--stage-color, transparent);
}
.stage.lit .stage-dot { box-shadow: 0 0 9px var(--stage-color); }
.stage-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8b93a7;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stage-count {
  font-size: 12px;
  font-weight: 700;
  color: #e8ebf1;
  font-variant-numeric: tabular-nums;
}
.stage.hit { animation: far-hit 0.7s ease; }
@keyframes far-hit {
  0% { box-shadow: 0 0 0 1px var(--stage-color); background: rgba(255, 255, 255, 0.09); }
  100% { box-shadow: 0 0 0 1px transparent; background: #101318; }
}
.arrow {
  align-self: center;
  flex: 0 0 auto;
  color: #434a59;
  font-size: 12px;
}

.section-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #7d8598;
  font-weight: 650;
  margin-top: 2px;
}
.surfaces,
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 118px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: #3a3f4b transparent;
}
.surfaces::-webkit-scrollbar,
.events::-webkit-scrollbar { width: 6px; }
.surfaces::-webkit-scrollbar-thumb,
.events::-webkit-scrollbar-thumb { background: #3a3f4b; border-radius: 3px; }
.surface-row {
  display: grid;
  grid-template-columns: 84px 1fr 28px;
  gap: 7px;
  align-items: center;
  font-size: 11px;
  padding: 3px 6px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.025);
}
.surface-name {
  color: #aab1c2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.surface-bar {
  height: 6px;
  border-radius: 3px;
  background: #22262f;
  overflow: hidden;
}
.surface-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #2fbf71, #3ddc84);
  border-radius: 3px;
  transition: width 0.4s ease;
}
.surface-count {
  text-align: right;
  color: #e8ebf1;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.event {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 7px;
  align-items: center;
  font-size: 11px;
  padding: 2px 0;
}
.event.enter { animation: far-slide 0.3s ease; }
@keyframes far-slide {
  from { opacity: 0; transform: translateY(-5px); }
  to { opacity: 1; transform: none; }
}
.event .t {
  color: #6d7488;
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
}
.event-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9aa3b5;
}
.event-text {
  color: #aab1c2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty { color: #6d7488; font-size: 11px; font-style: italic; }

.footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  color: #6d7488;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  padding-top: 8px;
}
.dom-hidden::before { content: "\\25CF  "; color: #c084fc; }

@media (prefers-reduced-motion: reduce) {
  .badge.pulse,
  .stage.hit,
  .event.enter,
  .panel,
  .live-dot { animation: none; }
}
`;

  interface Bound {
    badge: HTMLElement;
    badgeCount: HTMLElement;
    panel: HTMLElement;
    headerTotal: HTMLElement;
    stageCounts: Partial<Record<AdStage, HTMLElement>>;
    surfaces: HTMLElement;
    events: HTMLElement;
    domHidden: HTMLElement;
    since: HTMLElement;
  }

  interface ShieldState {
    host: HTMLElement;
    bound: Bound;
    selectors: string;
    observer: MutationObserver | null;
    counted: WeakSet<Element>;
    domHidden: number;
    prevTotal: number;
    prevStages: Partial<Record<AdStage, number>>;
    lastEventAt: number;
  }

  interface HostWithRegistry extends HTMLElement {
    __farShield?: ShieldState;
  }

  let state: ShieldState | null = null;

  function fmtTime(at: number): string {
    const date = new Date(at);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function endpointLabel(endpoint: string): string {
    const parts = endpoint.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? endpoint;
  }

  function surfaceLabel(surface: string): string {
    return surface.replace(/([A-Z])/g, ' $1').toLowerCase();
  }

  function stageColor(stage: AdStage): string {
    return STAGE_META.find((meta) => meta.id === stage)?.color ?? '#9aa3b5';
  }

  function buildPipelineMarkup(): string {
    return STAGE_META.map((meta, index) => {
      const arrow = index === 0 ? '' : '<span class="arrow" aria-hidden="true">&rsaquo;</span>';
      return `${arrow}<div class="stage" data-stage="${meta.id}" role="listitem" title="${STAGE_TITLES[meta.id]}" style="--stage-color: ${meta.color}">
        <span class="stage-dot"></span>
        <span class="stage-label">${meta.label}</span>
        <span class="stage-count" data-stage-count="${meta.id}">0</span>
      </div>`;
    }).join('');
  }

  function buildMarkup(): string {
    return `
      <button class="badge" type="button" data-f="badge" aria-label="Freebuff Shield dashboard">
        <span class="mark" aria-hidden="true">${SHIELD_SVG}</span>
        <span class="badge-count" data-f="badgeCount">0</span>
      </button>
      <section class="panel" data-f="panel" hidden aria-label="Ad blocking dashboard">
        <header class="header">
          <div class="header-title"><span class="mark mark-sm" aria-hidden="true">${SHIELD_SVG}</span> Freebuff Shield</div>
          <div class="live"><span class="live-dot"></span> live</div>
        </header>
        <div class="hero">
          <span class="header-total" data-f="headerTotal">0</span>
          <span class="hero-label">ads stopped this session</span>
        </div>
        <div class="pipeline" role="list" aria-label="Ad funnel stages">${buildPipelineMarkup()}</div>
        <div class="section-label">Top surfaces</div>
        <ul class="surfaces" data-f="surfaces"></ul>
        <div class="section-label">Latest stops</div>
        <ul class="events" data-f="events"></ul>
        <footer class="footer">
          <span class="dom-hidden" data-f="domHidden">0 hidden in page</span>
          <span class="since" data-f="since"></span>
        </footer>
      </section>
    `;
  }

  function bind(root: ParentNode): Bound {
    const byData = (key: string): HTMLElement => {
      const found = root.querySelector(`[data-f="${key}"]`);
      if (!found) throw new Error(`dashboard markup missing data-f="${key}"`);
      return found as HTMLElement;
    };
    const stageCounts: Partial<Record<AdStage, HTMLElement>> = {};
    for (const meta of STAGE_META) {
      const node = root.querySelector(`[data-stage-count="${meta.id}"]`);
      if (node) stageCounts[meta.id] = node as HTMLElement;
    }
    return {
      badge: byData('badge'),
      badgeCount: byData('badgeCount'),
      panel: byData('panel'),
      headerTotal: byData('headerTotal'),
      stageCounts,
      surfaces: byData('surfaces'),
      events: byData('events'),
      domHidden: byData('domHidden'),
      since: byData('since'),
    };
  }

  function createHost(doc: Document): { host: HTMLElement; bound: Bound } {
    const host = doc.createElement('div');
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
    const root = doc.createElement('div');
    root.className = 'far-root';
    root.innerHTML = buildMarkup();
    shadow.appendChild(root);
    const bound = bind(root);
    doc.body.appendChild(host);
    return { host, bound };
  }

  function freshState(doc: Document, selectors: string): ShieldState {
    state?.observer?.disconnect();
    const { host, bound } = createHost(doc);
    const nextState: ShieldState = {
      host,
      bound,
      selectors,
      observer: null,
      counted: new WeakSet<Element>(),
      domHidden: 0,
      prevTotal: 0,
      prevStages: {},
      lastEventAt: 0,
    };
    (host as HostWithRegistry).__farShield = nextState;
    wireBadge(nextState);
    return nextState;
  }

  function wireBadge(s: ShieldState): void {
    s.bound.badge.addEventListener('click', () => {
      const hidden = s.bound.panel.hasAttribute('hidden');
      if (hidden) {
        s.bound.panel.removeAttribute('hidden');
      } else {
        s.bound.panel.setAttribute('hidden', '');
      }
    });
  }

  function readRegistry(host: HTMLElement): ShieldState | null {
    return (host as HostWithRegistry).__farShield ?? null;
  }

  function ensureObserver(doc: Document, s: ShieldState): void {
    if (s.observer || typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        for (const raw of entry.addedNodes) {
          if (raw.nodeType !== 1) continue;
          changed = countMatches(raw as Element, s) || changed;
        }
      }
      if (changed) renderDomCount(s);
    });
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    s.observer = observer;
  }

  function countMatches(element: Element, s: ShieldState): boolean {
    if (!s.selectors) return false;
    let changed = false;
    if (!s.counted.has(element) && element.matches(s.selectors)) {
      s.counted.add(element);
      s.domHidden += 1;
      changed = true;
    }
    for (const nested of element.querySelectorAll(s.selectors)) {
      if (s.counted.has(nested)) continue;
      s.counted.add(nested);
      s.domHidden += 1;
      changed = true;
    }
    return changed;
  }

  function renderDomCount(s: ShieldState): void {
    s.bound.domHidden.textContent = `${String(s.domHidden)} hidden in page`;
  }

  function restartClass(element: Element | null | undefined, className: string): void {
    if (!element) return;
    element.classList.remove(className);
    element.getBoundingClientRect();
    element.classList.add(className);
  }

  function renderSurfaces(s: ShieldState, snapshot: StatsSnapshot): void {
    const entries = Object.entries(snapshot.bySurface)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const max = entries[0]?.[1] ?? 1;
    const doc = s.host.ownerDocument;
    const list = doc.createElement('ul');
    list.className = 'surfaces';
    list.setAttribute('data-f', 'surfaces');
    for (const [surface, count] of entries) {
      const row = doc.createElement('li');
      row.className = 'surface-row';
      row.setAttribute('data-surface', surface);

      const name = doc.createElement('span');
      name.className = 'surface-name';
      name.textContent = surfaceLabel(surface);

      const bar = doc.createElement('span');
      bar.className = 'surface-bar';
      const fill = doc.createElement('span');
      fill.className = 'surface-fill';
      fill.style.width = `${String(Math.round((count / max) * 100))}%`;
      bar.appendChild(fill);

      const number = doc.createElement('span');
      number.className = 'surface-count';
      number.textContent = String(count);

      row.append(name, bar, number);
      list.appendChild(row);
    }
    s.bound.surfaces.replaceWith(list);
    s.bound.surfaces = list;
  }

  function renderEvents(s: ShieldState, snapshot: StatsSnapshot): void {
    const doc = s.host.ownerDocument;
    const list = doc.createElement('ul');
    list.className = 'events';
    list.setAttribute('data-f', 'events');
    const recent = snapshot.recent.slice(0, 6);

    if (recent.length === 0) {
      const empty = doc.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'watching for ads…';
      list.appendChild(empty);
    } else {
      recent.forEach((event, index) => {
        const item = doc.createElement('li');
        item.className = 'event';
        if (index === 0 && event.at !== s.lastEventAt) item.classList.add('enter');

        const time = doc.createElement('span');
        time.className = 't';
        time.textContent = fmtTime(event.at);

        const dot = doc.createElement('span');
        dot.className = 'event-dot';
        dot.setAttribute('data-stage', event.stage);
        dot.style.background = stageColor(event.stage);

        const text = doc.createElement('span');
        text.className = 'event-text';
        text.textContent = `${event.stage} · ${endpointLabel(event.endpoint)}`;

        item.append(time, dot, text);
        list.appendChild(item);
      });
      s.lastEventAt = recent[0]?.at ?? s.lastEventAt;
    }

    s.bound.events.replaceWith(list);
    s.bound.events = list;
  }

  function install(options: { hideSelectors: string }): void {
    const doc = document;
    const existing = doc.getElementById(HOST_ID);
    if (existing?.shadowRoot) {
      const shared = readRegistry(existing);
      if (shared) {
        shared.selectors = options.hideSelectors;
        state = shared;
        ensureObserver(doc, shared);
        return;
      }
      const bound = bind(existing.shadowRoot);
      const adopted: ShieldState = {
        host: existing,
        bound,
        selectors: options.hideSelectors,
        observer: null,
        counted: new WeakSet<Element>(),
        domHidden: 0,
        prevTotal: 0,
        prevStages: {},
        lastEventAt: 0,
      };
      (existing as HostWithRegistry).__farShield = adopted;
      wireBadge(adopted);
      state = adopted;
      ensureObserver(doc, adopted);
      return;
    }
    const next = freshState(doc, options.hideSelectors);
    state = next;
    ensureObserver(doc, next);
  }

  function update(snapshot: StatsSnapshot): void {
    if (!state) return;
    if (!state.host.isConnected) {
      install({ hideSelectors: state.selectors });
    }
    const s = state;

    s.bound.badgeCount.textContent = String(snapshot.total);
    s.bound.headerTotal.textContent = String(snapshot.total);
    if (snapshot.total > s.prevTotal) restartClass(s.bound.badge, 'pulse');
    s.prevTotal = snapshot.total;

    for (const meta of STAGE_META) {
      const counts: Record<string, number> = snapshot.byStage;
      const count = counts[meta.id] ?? 0;
      const node = s.bound.stageCounts[meta.id];
      if (node) {
        node.textContent = String(count);
        const stageEl = node.closest('.stage');
        if (count > (s.prevStages[meta.id] ?? 0)) {
          restartClass(stageEl, 'hit');
        }
        stageEl?.classList.toggle('lit', count > 0);
      }
      s.prevStages[meta.id] = count;
    }

    renderSurfaces(s, snapshot);
    renderEvents(s, snapshot);
    renderDomCount(s);
    s.bound.since.textContent = `since ${fmtTime(snapshot.startedAt)}`;
  }

  function isOpen(): boolean {
    if (!state) return false;
    return !state.bound.panel.hasAttribute('hidden');
  }

  function unmount(): void {
    state?.observer?.disconnect();
    state = null;
    document.getElementById(HOST_ID)?.remove();
  }

  const api: FarBuffShieldApi = { install, update, unmount, isOpen };
  (globalThis as unknown as { farBuffShield: FarBuffShieldApi }).farBuffShield = api;
})();
