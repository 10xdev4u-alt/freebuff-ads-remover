import type { AdStage, FarBuffShieldApi, ShieldInstallOptions, StatsSnapshot } from './types.js';

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
    /** Compact label for the stage grid (tooltips carry the full name). */
    label: string;
    title: string;
    /** Muted per-stage bearing colour; the accent stays reserved for totals. */
    hue: number;
  }

  const STAGE_META: StageMeta[] = [
    { id: 'inventory', label: 'Inv', title: 'Inventory', hue: 210 },
    { id: 'bid', label: 'Bid', title: 'Bid', hue: 43 },
    { id: 'policy', label: 'Pol', title: 'Policy', hue: 265 },
    { id: 'media', label: 'Med', title: 'Media', hue: 320 },
    { id: 'delivery', label: 'Dlv', title: 'Delivery', hue: 150 },
    { id: 'promo', label: 'Prm', title: 'Promo', hue: 5 },
  ];

  const SHIELD_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">'
    + '<path d="M12 2.6 19.8 5.5v5.9c0 4.9-3.3 8.2-7.8 9.9-4.5-1.7-7.8-5-7.8-9.9V5.5L12 2.6z"'
    + ' stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'
    + '<path d="M8.9 12.1l2.2 2.2 4-4.4" stroke="currentColor" stroke-width="1.8"'
    + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

  type ShieldView = 'radar' | 'ledger';

  /** Minutes in the ledger heat grid (matches StatsStore's 30-minute window). */
  const HEAT_CELLS = 30;
  /** Wall-clock lifetime of a radar blip, in ms. */
  const BLIP_MS = 3200;
  /** Hard cap so a burst can never flood the sweep. */
  const MAX_BLIPS = 60;

  const CSS = `
:host {
  all: initial;
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483646;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  --far-accent: #3ddc84;
  --far-accent-ink: #06220f;
  --far-surface: #1b1e25;
  --far-surface-2: #22262f;
  --far-sunken: #101318;
  --far-line: rgba(255, 255, 255, 0.09);
  --far-line-2: rgba(255, 255, 255, 0.14);
  --far-txt: #aab1c2;
  --far-txt-2: #c6cbd6;
  --far-txt-3: #e8ebf1;
  --far-txt-0: #6d7488;
  --far-r: 5px;
  --far-shadow: 0 3px 0 #0e1014;
  --far-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.far-root { all: initial; display: block; color: var(--far-txt-3); }
.far-root *, .far-root *::before, .far-root *::after { box-sizing: border-box; }

/* ---------------- badge ---------------- */
.badge {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  padding: 0;
  border-radius: var(--far-r);
  border: 1px solid var(--far-line);
  background: var(--far-surface);
  box-shadow: var(--far-shadow);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.badge:hover { border-color: var(--far-accent); background: var(--far-surface-2); }
.badge:focus-visible { outline: 2px solid var(--far-accent); outline-offset: 2px; }
.mark { display: inline-flex; width: 22px; height: 22px; color: var(--far-txt); }
.mark svg { width: 100%; height: 100%; display: block; }
.mark-sm { width: 15px; height: 15px; }
.badge:hover .mark { color: var(--far-accent); }
.badge-count {
  position: absolute;
  right: -7px;
  top: -7px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--far-accent);
  color: var(--far-accent-ink);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}
.badge.pulse { animation: far-pulse 0.55s ease; }
@keyframes far-pulse {
  0% { transform: scale(1); }
  35% { transform: scale(1.12); }
  100% { transform: scale(1); }
}

/* ---------------- panel ---------------- */
.panel {
  position: absolute;
  right: 0;
  bottom: 58px;
  width: 340px;
  max-height: 74vh;
  overflow: auto;
  background: var(--far-surface);
  border: 1px solid var(--far-line);
  border-radius: var(--far-r);
  box-shadow: var(--far-shadow), 0 16px 40px rgba(0, 0, 0, 0.5);
  color: var(--far-txt-3);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: far-in 0.16s ease;
  scrollbar-width: thin;
  scrollbar-color: #3a3f4b transparent;
}
.panel[hidden] { display: none; }
.panel::-webkit-scrollbar { width: 6px; }
.panel::-webkit-scrollbar-thumb { background: #3a3f4b; border-radius: 3px; }
@keyframes far-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.header-title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0.01em;
  color: var(--far-txt-3);
}
.version { font-size: 10px; font-weight: 600; color: var(--far-txt-0); font-variant-numeric: tabular-nums; }
.version:empty { display: none; }
.header-tools { display: flex; align-items: center; gap: 8px; }
.live {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--far-txt-0);
  font-weight: 600;
}
.live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--far-accent); animation: far-blink 1.6s infinite; }
@keyframes far-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.p-close {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--far-txt-0);
  font-family: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease;
}
.p-close:hover { color: var(--far-txt-3); background: var(--far-surface-2); }
.p-close:focus-visible { outline: 2px solid var(--far-accent); outline-offset: 1px; }

/* ---------------- view switch ---------------- */
.pseg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
  padding: 2px;
  background: var(--far-sunken);
  border: 1px solid var(--far-line);
  border-radius: 4px;
}
.pseg button {
  padding: 5px 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--far-txt-0);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: color 0.12s ease, background 0.12s ease;
}
.pseg button:hover { color: var(--far-txt-2); }
.pseg button[aria-selected="true"] {
  background: var(--far-surface-2);
  color: var(--far-txt-3);
  box-shadow: inset 0 0 0 1px var(--far-line);
}
.pseg button:focus-visible { outline: 2px solid var(--far-accent); outline-offset: 1px; }

/* ---------------- hero ---------------- */
.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--far-line);
}
.hero-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.header-total {
  font-size: 30px;
  line-height: 1;
  font-weight: 700;
  color: var(--far-accent);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.hero-label { font-size: 10.5px; color: var(--far-txt-0); white-space: nowrap; }
.spark { width: 76px; height: auto; display: block; overflow: visible; }
.spark-line { fill: none; stroke: var(--far-accent); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.spark-area { fill: url(#far-spark-fill); stroke: none; }

/* ---------------- stage area: radar | heat + shared stage grid ---------------- */
.stage-area { display: grid; gap: 10px; }
.panel[data-view="radar"] .stage-area {
  grid-template-columns: 168px 1fr;
  grid-template-areas: "radar legend";
  align-items: center;
}
.panel[data-view="radar"] .heat-wrap { display: none; }
.panel[data-view="ledger"] .stage-area { grid-template-columns: 1fr; grid-template-areas: "heat" "legend"; }
.panel[data-view="ledger"] .radar-box { display: none; }

.radar-box { grid-area: radar; position: relative; width: 168px; height: 168px; }
.radar-box canvas { display: block; width: 168px; height: 168px; }

.heat-wrap { grid-area: heat; }
.heat-grid { display: grid; grid-template-columns: repeat(15, 1fr); gap: 2px; }
.heat-grid i { display: block; aspect-ratio: 1 / 1; border-radius: 2px; background: var(--far-surface-2); transition: background 0.4s ease; }
.heat-cap {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-family: var(--far-mono);
  font-size: 9.5px;
  color: var(--far-txt-0);
}

.pipeline { grid-area: legend; display: flex; flex-direction: column; gap: 5px; }
.panel[data-view="ledger"] .pipeline { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.stage {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 7px;
  border-radius: 4px;
  background: var(--far-sunken);
  border: 1px solid transparent;
}
.stage.lit { border-color: var(--far-line); }
.stage-dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--stage-color, #9aa3b5);
  opacity: 0.4;
  transition: opacity 0.3s ease;
}
.stage.lit .stage-dot { opacity: 1; }
.stage-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--far-txt-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stage-count {
  margin-left: auto;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--far-txt-0);
  font-variant-numeric: tabular-nums;
}
.stage.lit .stage-count { color: var(--far-txt-3); }
.stage.hit { animation: far-hit 0.7s ease; }
@keyframes far-hit {
  0% { box-shadow: 0 0 0 1px var(--stage-color); background: rgba(255, 255, 255, 0.08); }
  100% { box-shadow: 0 0 0 1px transparent; background: var(--far-sunken); }
}

/* ---------------- lists ---------------- */
.section-label {
  font-family: var(--far-mono);
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--far-txt-0);
  font-weight: 600;
}
.surfaces,
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 110px;
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
  grid-template-columns: 84px 1fr 26px;
  gap: 7px;
  align-items: center;
  font-size: 11px;
  padding: 2px 4px;
}
.surface-name { color: var(--far-txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.surface-bar { height: 4px; border-radius: 2px; background: var(--far-surface-2); overflow: hidden; }
.surface-fill { display: block; height: 100%; background: var(--far-accent); border-radius: 2px; transition: width 0.4s ease; }
.surface-count { text-align: right; color: var(--far-txt-2); font-weight: 650; font-variant-numeric: tabular-nums; }

.event {
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  gap: 7px;
  align-items: center;
  font-size: 11px;
  padding: 2px 0;
}
.event.enter { animation: far-slide 0.3s ease; }
@keyframes far-slide {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
.event .t { color: var(--far-txt-0); font-variant-numeric: tabular-nums; font-family: var(--far-mono); font-size: 9.5px; }
.event-dot { width: 7px; height: 7px; border-radius: 50%; background: #9aa3b5; }
.event-tag { font-family: var(--far-mono); font-size: 9.5px; font-weight: 600; color: var(--far-txt-0); white-space: nowrap; }
.event-pill {
  justify-self: start;
  max-width: 100%;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--far-surface-2);
  border: 1px solid var(--far-line);
  color: var(--far-txt-2);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.empty { color: var(--far-txt-0); font-size: 11px; font-style: italic; }

.footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 9.5px;
  color: var(--far-txt-0);
  font-family: var(--far-mono);
  border-top: 1px solid var(--far-line);
  padding-top: 8px;
}
.dom-hidden::before { content: "\\25CF  "; color: var(--far-accent); }

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
    version: HTMLElement;
    sparkLine: Element | null;
    sparkArea: Element | null;
    stageCounts: Partial<Record<AdStage, HTMLElement>>;
    surfaces: HTMLElement;
    events: HTMLElement;
    domHidden: HTMLElement;
    since: HTMLElement;
    pseg: HTMLElement;
    closeBtn: HTMLElement;
    radarBox: HTMLElement;
    radarCanvas: HTMLCanvasElement;
    heat: HTMLElement;
  }

  interface Blip {
    /** Index into STAGE_META — the wedge this block landed on. */
    stage: number;
    angle: number;
    radius: number;
    /** performance.now() at spawn; blips expire on wall clock so they age even
     *  while the radar is off screen. */
    born: number;
  }

  interface RadarState {
    ctx: CanvasRenderingContext2D | null;
    size: number;
    sweep: number;
    blips: Blip[];
    frame: number | null;
    last: number;
  }

  interface ShieldState {
    host: HTMLElement;
    bound: Bound;
    selectors: string;
    version: string;
    observer: MutationObserver | null;
    counted: WeakSet<Element>;
    domHidden: number;
    prevTotal: number;
    prevStages: Partial<Record<AdStage, number>>;
    lastEventAt: number;
    /** Newest event timestamp already turned into a blip. */
    lastBlipAt: number;
    view: ShieldView;
    radar: RadarState;
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

  function stageMeta(stage: AdStage): StageMeta | undefined {
    return STAGE_META.find((meta) => meta.id === stage);
  }

  function stageColor(stage: AdStage): string {
    const meta = stageMeta(stage);
    return meta ? `hsl(${String(meta.hue)}, 38%, 68%)` : '#9aa3b5';
  }

  /** Muted per-stage hue, used for radar wedges and blips. */
  function stageInk(index: number, light: number, alpha: number): string {
    const meta = STAGE_META[index];
    const hue = meta ? meta.hue : 210;
    return `hsla(${String(hue)}, 42%, ${String(light)}%, ${String(alpha)})`;
  }

  function buildPipelineMarkup(): string {
    return STAGE_META.map((meta) => {
      return `<div class="stage" data-stage="${meta.id}" role="listitem" title="${meta.title}" style="--stage-color: ${stageColor(meta.id)}">
        <span class="stage-dot"></span>
        <span class="stage-label">${meta.label}</span>
        <span class="stage-count" data-stage-count="${meta.id}">0</span>
      </div>`;
    }).join('');
  }

  function buildMarkup(): string {
    return `
      <button class="badge" type="button" data-f="badge" aria-label="Freebuff Shield dashboard" aria-expanded="false" aria-controls="far-shield-panel">
        <span class="mark" aria-hidden="true">${SHIELD_SVG}</span>
        <span class="badge-count" data-f="badgeCount">0</span>
      </button>
      <section class="panel" data-f="panel" id="far-shield-panel" data-view="radar" hidden aria-label="Ad blocking dashboard">
        <header class="header">
          <div class="header-title"><span class="mark mark-sm" aria-hidden="true">${SHIELD_SVG}</span> Freebuff Shield <span class="version" data-f="version"></span></div>
          <div class="header-tools">
            <span class="live"><span class="live-dot"></span> live</span>
            <button class="p-close" type="button" data-f="close" aria-label="Close dashboard" title="Close">&#215;</button>
          </div>
        </header>
        <div class="pseg" data-f="pseg" role="tablist" aria-label="Shield view">
          <button type="button" role="tab" data-view-btn="radar" aria-selected="true">Radar</button>
          <button type="button" role="tab" data-view-btn="ledger" aria-selected="false">Ledger</button>
        </div>
        <div class="hero">
          <div class="hero-main">
            <span class="header-total" data-f="headerTotal">0</span>
            <span class="hero-label">ads stopped this session</span>
          </div>
          <svg class="spark" data-f="spark" viewBox="0 0 72 30" aria-hidden="true">
            <defs><linearGradient id="far-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#3ddc84" stop-opacity="0.26"/>
              <stop offset="1" stop-color="#3ddc84" stop-opacity="0"/>
            </linearGradient></defs>
            <path class="spark-area" data-f="sparkArea" d=""/>
            <polyline class="spark-line" data-f="sparkLine" points=""/>
          </svg>
        </div>
        <div class="stage-area">
          <div class="radar-box" data-f="radarBox"><canvas data-f="radar" width="168" height="168"></canvas></div>
          <div class="heat-wrap">
            <div class="heat-grid" data-f="heat"></div>
            <div class="heat-cap"><span>30 min ago</span><span>blocks/min</span><span>now</span></div>
          </div>
          <div class="pipeline" role="list" aria-label="Ad funnel stages">${buildPipelineMarkup()}</div>
        </div>
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
    const canvas = root.querySelector('[data-f="radar"]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('dashboard markup missing the radar canvas');
    }
    return {
      badge: byData('badge'),
      badgeCount: byData('badgeCount'),
      panel: byData('panel'),
      headerTotal: byData('headerTotal'),
      version: byData('version'),
      sparkLine: root.querySelector('[data-f="sparkLine"]'),
      sparkArea: root.querySelector('[data-f="sparkArea"]'),
      stageCounts,
      surfaces: byData('surfaces'),
      events: byData('events'),
      domHidden: byData('domHidden'),
      since: byData('since'),
      pseg: byData('pseg'),
      closeBtn: byData('close'),
      radarBox: byData('radarBox'),
      radarCanvas: canvas,
      heat: byData('heat'),
    };
  }

  function freshState(doc: Document, options: ShieldInstallOptions): ShieldState {
    const previous = state;
    previous?.observer?.disconnect();
    stopLoop(previous);

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

    const nextState: ShieldState = {
      host,
      bound,
      selectors: options.hideSelectors,
      version: options.version ?? '',
      observer: null,
      counted: new WeakSet<Element>(),
      domHidden: 0,
      prevTotal: 0,
      prevStages: {},
      lastEventAt: 0,
      lastBlipAt: 0,
      view: previous?.view ?? 'radar',
      radar: { ctx: null, size: 0, sweep: -Math.PI / 2, blips: [], frame: null, last: 0 },
    };
    (host as HostWithRegistry).__farShield = nextState;
    wire(nextState);
    setView(nextState, nextState.view);
    return nextState;
  }

  function wire(s: ShieldState): void {
    s.bound.badge.addEventListener('click', () => {
      setOpen(s, s.bound.panel.hasAttribute('hidden'));
    });
    s.bound.closeBtn.addEventListener('click', () => {
      setOpen(s, false);
      s.bound.badge.focus();
    });
    s.bound.pseg.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('[data-view-btn]');
      if (!(button instanceof HTMLElement)) return;
      const next = button.dataset.viewBtn;
      if (next === 'radar' || next === 'ledger') setView(s, next);
    });
    s.bound.pseg.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setView(s, s.view === 'radar' ? 'ledger' : 'radar');
      const next = s.bound.pseg.querySelector(`[data-view-btn="${s.view}"]`);
      if (next instanceof HTMLElement) next.focus();
    });
  }

  function setOpen(s: ShieldState, open: boolean): void {
    if (open) {
      s.bound.panel.removeAttribute('hidden');
    } else {
      s.bound.panel.setAttribute('hidden', '');
    }
    s.bound.badge.setAttribute('aria-expanded', String(open));
    if (open && s.view === 'radar') {
      ensureLoop(s);
    } else {
      stopLoop(s);
    }
  }

  function setView(s: ShieldState, view: ShieldView): void {
    s.view = view;
    s.bound.panel.setAttribute('data-view', view);
    const buttons = s.bound.pseg.querySelectorAll('[data-view-btn]');
    for (const button of buttons) {
      if (!(button instanceof HTMLElement)) continue;
      const on = button.dataset.viewBtn === view;
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
    }
    if (view === 'radar' && !s.bound.panel.hasAttribute('hidden')) {
      s.radar.blips.length = 0; // start each sweep clean
      ensureLoop(s);
    } else {
      stopLoop(s);
    }
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

  function renderVersion(s: ShieldState): void {
    s.bound.version.textContent = s.version ? `v${s.version}` : '';
  }

  function renderDomCount(s: ShieldState): void {
    s.bound.domHidden.textContent = `${String(s.domHidden)} hidden in page`;
  }

  function renderSpark(s: ShieldState, snapshot: StatsSnapshot): void {
    const line = s.bound.sparkLine;
    const area = s.bound.sparkArea;
    if (!line || !area) return;
    const buckets = snapshot.perMinute.slice(-30);
    if (buckets.length === 0) {
      line.setAttribute('points', '');
      area.setAttribute('d', '');
      return;
    }
    const width = 72;
    const height = 30;
    const pad = 3;
    const vals = buckets.map((bucket) => bucket.count);
    const max = Math.max(1, ...vals);
    const step = buckets.length > 1 ? (width - pad * 2) / (buckets.length - 1) : 0;
    const pts = vals.map(
      (v, i) => `${(pad + i * step).toFixed(1)},${(height - pad - (v / max) * (height - pad * 2)).toFixed(1)}`,
    );
    line.setAttribute('points', pts.join(' '));
    const base = height - pad;
    area.setAttribute(
      'd',
      `M${String(pad)},${String(base)} L${pts.join(' L')} L${(width - pad).toFixed(1)},${String(base)} Z`,
    );
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

        const tag = doc.createElement('span');
        tag.className = 'event-tag';
        tag.textContent = `[${event.stage}]`;

        const pill = doc.createElement('span');
        pill.className = 'event-pill';
        pill.textContent = endpointLabel(event.endpoint);

        item.append(time, dot, tag, pill);
        list.appendChild(item);
      });
      s.lastEventAt = recent[0]?.at ?? s.lastEventAt;
    }

    s.bound.events.replaceWith(list);
    s.bound.events = list;
  }

  /**
   * Ledger heat grid. StatsStore's perMinute array is sparse — it only holds
   * minutes that saw at least one block — so the window is rebuilt against a
   * contiguous minute axis ending at the snapshot's own clock, and the gaps
   * become real zero cells instead of collapsing the row.
   */
  function renderHeat(s: ShieldState, snapshot: StatsSnapshot): void {
    const grid = s.bound.heat;
    const doc = s.host.ownerDocument;
    if (grid.childElementCount !== HEAT_CELLS) {
      grid.replaceChildren();
      for (let i = 0; i < HEAT_CELLS; i++) {
        grid.appendChild(doc.createElement('i'));
      }
    }
    const counts = new Map<number, number>();
    for (const bucket of snapshot.perMinute) counts.set(bucket.minute, bucket.count);

    const endMinute = Math.floor(snapshot.at / 60_000);
    const startMinute = endMinute - (HEAT_CELLS - 1);
    let max = 1;
    for (let i = 0; i < HEAT_CELLS; i++) {
      const v = counts.get(startMinute + i) ?? 0;
      if (v > max) max = v;
    }
    const cells = grid.children;
    for (let i = 0; i < HEAT_CELLS; i++) {
      const cell = cells[i];
      if (!(cell instanceof HTMLElement)) continue;
      const minute = startMinute + i;
      const v = counts.get(minute) ?? 0;
      if (v === 0) {
        cell.style.background = '';
        cell.removeAttribute('title');
        continue;
      }
      const t = v / max;
      // #3ddc84 = rgb(61, 220, 132) — inline styles can't read the shadow var.
      cell.style.background = `rgba(61, 220, 132, ${(0.18 + t * 0.72).toFixed(3)})`;
      cell.title = `${String(v)} at ${fmtTime(minute * 60_000)}`;
    }
  }

  function spawnBlips(s: ShieldState, snapshot: StatsSnapshot): void {
    const newer = snapshot.recent.filter((event) => event.at > s.lastBlipAt);
    const newest = snapshot.recent[0];
    if (newest) s.lastBlipAt = Math.max(s.lastBlipAt, newest.at);
    if (newer.length === 0) return;
    // `recent` is newest-first; walk it oldest-first so blips land in order.
    const ordered = newer.slice(0, 12).reverse();
    for (const event of ordered) {
      const index = STAGE_META.findIndex((meta) => meta.id === event.stage);
      if (index < 0) continue;
      s.radar.blips.push({
        stage: index,
        angle: index * (Math.PI * 2 / STAGE_META.length) - Math.PI / 2
          + (Math.PI * 2 / STAGE_META.length) * (0.18 + Math.random() * 0.64),
        radius: 0.34 + Math.random() * 0.62,
        born: performance.now(),
      });
    }
    if (s.radar.blips.length > MAX_BLIPS) {
      s.radar.blips.splice(0, s.radar.blips.length - MAX_BLIPS);
    }
  }

  /**
   * Re-derive the canvas backing store from layout on every visible frame, so
   * it self-heals after the pane, window or DPR changes without depending on
   * a resize observer or on the order in which the panel was unhidden.
   */
  function syncRadar(s: ShieldState): void {
    const box = s.bound.radarBox;
    if (!box.isConnected) return;
    const width = Math.round(box.getBoundingClientRect().width);
    if (width < 1 || width === s.radar.size) return;
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2);
    const canvas = s.bound.radarCanvas;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(width * dpr);
    canvas.style.width = `${String(width)}px`;
    canvas.style.height = `${String(width)}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.radar.ctx = ctx;
    s.radar.size = width;
  }

  function drawRadar(s: ShieldState, now: number, counts: Record<string, number>): void {
    const ctx = s.radar.ctx;
    const size = s.radar.size;
    if (!ctx || size < 1) return;
    const c = size / 2;
    const inner = size * 0.215;
    const ring = size * 0.44;
    const band = size * 0.05;
    const bandRadius = ring + band / 2;
    const sector = Math.PI * 2 / STAGE_META.length;

    ctx.clearRect(0, 0, size, size);

    // Outer bearing band: one wedge per stage, filled by share of the busiest.
    let busiest = 1;
    for (const meta of STAGE_META) {
      const v = counts[meta.id] ?? 0;
      if (v > busiest) busiest = v;
    }
    STAGE_META.forEach((meta, i) => {
      const share = (counts[meta.id] ?? 0) / busiest;
      const a0 = i * sector - Math.PI / 2;
      const a1 = a0 + sector;
      ctx.beginPath();
      ctx.arc(c, c, bandRadius, a0 + 0.03, a1 - 0.03);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = band;
      ctx.stroke();
      if (share > 0) {
        ctx.beginPath();
        ctx.arc(c, c, bandRadius, a0 + 0.03, a0 + 0.03 + (sector - 0.06) * share);
        ctx.strokeStyle = stageInk(i, 60, 0.9);
        ctx.lineWidth = band;
        ctx.stroke();
      }
    });

    // Range rings and spokes.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (const f of [0.42, 0.72, 1]) {
      ctx.beginPath();
      ctx.arc(c, c, inner + (ring - inner) * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    STAGE_META.forEach((_meta, i) => {
      const a = i * sector - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
      ctx.lineTo(c + Math.cos(a) * ring, c + Math.sin(a) * ring);
      ctx.stroke();
    });

    // Sweep.
    const span = 1;
    const gradient = ctx.createRadialGradient(c, c, inner, c, c, ring);
    gradient.addColorStop(0, 'rgba(61, 220, 132, 0.15)');
    gradient.addColorStop(1, 'rgba(61, 220, 132, 0)');
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, ring, s.radar.sweep - span, s.radar.sweep);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(s.radar.sweep) * ring, c + Math.sin(s.radar.sweep) * ring);
    ctx.strokeStyle = 'rgba(61, 220, 132, 0.5)';
    ctx.stroke();

    // Blips — brightest under the sweep line, fading as it moves on.
    for (const blip of s.radar.blips) {
      const p = (now - blip.born) / BLIP_MS;
      if (p < 0 || p > 1) continue;
      const fade = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
      if (fade <= 0) continue;
      const r = inner + (ring - inner) * blip.radius;
      const bx = c + Math.cos(blip.angle) * r;
      const by = c + Math.sin(blip.angle) * r;
      let d = Math.abs(((blip.angle - s.radar.sweep + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      d = 1 - Math.min(1, d / span);
      const alpha = Math.min(1, fade * (0.42 + d * 0.58));
      const dot = 1.6 + d * 1.8;
      ctx.beginPath();
      ctx.arc(bx, by, dot, 0, Math.PI * 2);
      ctx.fillStyle = stageInk(blip.stage, 74, alpha);
      ctx.fill();
      if (d > 0.6) {
        ctx.beginPath();
        ctx.arc(bx, by, dot + 3, 0, Math.PI * 2);
        ctx.strokeStyle = stageInk(blip.stage, 70, (d - 0.6) * 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Hub.
    ctx.beginPath();
    ctx.arc(c, c, inner, 0, Math.PI * 2);
    ctx.fillStyle = '#14161b';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();
  }

  let latest: StatsSnapshot | null = null;

  function step(s: ShieldState, now: number): void {
    s.radar.frame = null;
    // Self-terminate if the state was replaced, the panel closed, the user
    // switched views, or the page went to the background.
    if (state !== s) return;
    if (s.bound.panel.hasAttribute('hidden') || s.view !== 'radar') return;
    if (document.hidden) {
      s.radar.frame = requestAnimationFrame((t) => { step(s, t); });
      return;
    }
    const dt = s.radar.last === 0 ? 0 : Math.min(0.1, (now - s.radar.last) / 1000);
    s.radar.last = now;
    syncRadar(s);
    s.radar.sweep = (s.radar.sweep + dt * 1.5) % (Math.PI * 2);
    const cutoff = now - BLIP_MS;
    if (s.radar.blips.length > 0) {
      s.radar.blips = s.radar.blips.filter((blip) => blip.born >= cutoff);
    }
    if (latest) drawRadar(s, now, latest.byStage);
    s.radar.frame = requestAnimationFrame((t) => { step(s, t); });
  }

  function ensureLoop(s: ShieldState): void {
    if (s.radar.frame !== null || typeof requestAnimationFrame !== 'function') return;
    s.radar.last = 0;
    s.radar.frame = requestAnimationFrame((t) => { step(s, t); });
  }

  function stopLoop(s: ShieldState | null): void {
    if (!s || s.radar.frame === null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(s.radar.frame);
    s.radar.frame = null;
  }

  function install(options: ShieldInstallOptions): void {
    const doc = document;
    const existing = doc.getElementById(HOST_ID);
    if (existing?.shadowRoot) {
      const shared = readRegistry(existing);
      if (shared) {
        shared.selectors = options.hideSelectors;
        shared.version = options.version ?? shared.version;
        state = shared;
        renderVersion(shared);
        ensureObserver(doc, shared);
        return;
      }
      // A host with no registry is a leftover: either the page kept the DOM
      // across an extension reload (its listeners are still attached, so
      // re-wiring would double-toggle) or it predates this markup revision.
      // Drop it and mount clean rather than adopt it into an unknown state.
      existing.remove();
    }
    const next = freshState(doc, options);
    state = next;
    renderVersion(next);
    ensureObserver(doc, next);
  }

  function update(snapshot: StatsSnapshot): void {
    if (!state) return;
    if (!state.host.isConnected) {
      install({ hideSelectors: state.selectors, version: state.version });
    }
    const s = state;
    latest = snapshot;

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
    renderSpark(s, snapshot);
    renderHeat(s, snapshot);
    spawnBlips(s, snapshot);
    renderDomCount(s);
    s.bound.since.textContent = `since ${fmtTime(snapshot.startedAt)}`;
    s.bound.panel.setAttribute('data-view', s.view);
  }

  function isOpen(): boolean {
    if (!state) return false;
    return !state.bound.panel.hasAttribute('hidden');
  }

  function unmount(): void {
    stopLoop(state);
    state?.observer?.disconnect();
    state = null;
    latest = null;
    document.getElementById(HOST_ID)?.remove();
  }

  const api: FarBuffShieldApi = { install, update, unmount, isOpen };
  (globalThis as unknown as { farBuffShield: FarBuffShieldApi }).farBuffShield = api;
})();
