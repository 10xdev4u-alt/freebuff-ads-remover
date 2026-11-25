// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

function emptySnapshot(log?: { json: string; csv: string }): StatsSnapshot {
  const snap = {
    total: 0, at: 0, startedAt: 0,
    byStage: { inventory: 0, bid: 0, policy: 0, media: 0, delivery: 0, promo: 0 },
    bySurface: {
      sponsorBreak: 0, billboard: 0, intermission: 0, spotlight: 0, showcase: 0,
      sponsoredTask: 0, sponsoredRun: 0, partner: 0, invitation: 0, sponsoredCard: 0,
    },
    byEndpoint: {}, recent: [], perMinute: [],
    perSurfaceMinute: {
      sponsorBreak: [], billboard: [], intermission: [], spotlight: [], showcase: [],
      sponsoredTask: [], sponsoredRun: [], partner: [], invitation: [], sponsoredCard: [],
    },
  } as StatsSnapshot;
  if (log) (snap as StatsSnapshot & { exportLog?: unknown }).exportLog = log;
  return snap;
}

function shadowEl(sel: string): HTMLElement {
  const host = document.querySelector('#far-shield-host');
  const found = host?.shadowRoot?.querySelector(sel);
  if (!found) throw new Error(`shadow element not found: ${sel}`);
  return found as HTMLElement;
}

const JSON_LOG = '[{"v":1,"at":7,"stage":"policy","surface":"sponsorBreak","endpoint":"/api/ad/policy","session":"default"}]';
const CSV_LOG = 'v,at,stage,surface,endpoint,session\n"1","7","policy","sponsorBreak","/api/ad/policy","default"';

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
const anchors: HTMLAnchorElement[] = [];

beforeEach(() => {
  document.body.innerHTML = '';
  anchors.length = 0;
  createObjectURL = vi.fn((blob: Blob) => `blob:${blob.type}`);
  revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    anchors.push(this);
  });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  api().install({ hideSelectors: HIDE_SELECTORS });
  api().update(emptySnapshot({ json: JSON_LOG, csv: CSV_LOG }));
});

afterEach(() => {
  api().unmount();
  vi.restoreAllMocks();
});

describe('dashboard block-log export', () => {
  it('renders JSON and CSV export buttons', () => {
    const json = shadowEl('[data-f="exportJson"]');
    const csv = shadowEl('[data-f="exportCsv"]');
    expect(json).toBeInstanceOf(HTMLButtonElement);
    expect(csv).toBeInstanceOf(HTMLButtonElement);
    expect(json.getAttribute('aria-label')).toMatch(/json/i);
    expect(csv.getAttribute('aria-label')).toMatch(/csv/i);
  });

  it('downloads the JSON payload byte-for-byte', async () => {
    shadowEl('[data-f="exportJson"]').click();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe(JSON_LOG);
    const anchor = anchors[0];
    if (!anchor) throw new Error('no download anchor was clicked');
    expect(anchor.href).toBe('blob:application/json');
    expect(anchor.download).toMatch(/^farblock-.*\.json$/);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:application/json');
  });

  it('downloads the CSV payload byte-for-byte', async () => {
    shadowEl('[data-f="exportCsv"]').click();
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toBe('text/csv');
    expect(await blob.text()).toBe(CSV_LOG);
    const anchor = anchors[0];
    if (!anchor) throw new Error('no download anchor was clicked');
    expect(anchor.download).toMatch(/^farblock-.*\.csv$/);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('exports valid empty documents', async () => {
    const json = '[]';
    const csv = 'v,at,stage,surface,endpoint,session';
    api().update(emptySnapshot({ json, csv }));
    shadowEl('[data-f="exportJson"]').click();
    expect(await (createObjectURL.mock.calls[0]?.[0] as Blob).text()).toBe(json);
    shadowEl('[data-f="exportCsv"]').click();
    expect(await (createObjectURL.mock.calls[1]?.[0] as Blob).text()).toBe(csv);
  });

  it('uses the newest snapshot, not a stale closure', async () => {
    api().update(emptySnapshot({ json: 'A', csv: 'A' }));
    api().update(emptySnapshot({ json: 'B', csv: 'B' }));
    shadowEl('[data-f="exportJson"]').click();
    expect(await (createObjectURL.mock.calls[0]?.[0] as Blob).text()).toBe('B');
  });

  it('does nothing after unmount', () => {
    const button = shadowEl('[data-f="exportJson"]');
    api().unmount();
    button.click();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('keeps the four-key page API', () => {
    expect(Object.keys(api()).sort()).toEqual(['install', 'isOpen', 'unmount', 'update']);
  });
});

describe('export code is page-safe', () => {
  const BODY = [
    '(() => {',
    '  const api = { install() {',
    '    document.querySelector("[data-f=exportCsv]")?.addEventListener("click", () => {',
    '      const blob = new Blob(["v,at\\n"], { type: "text/csv" });',
    '      const url = URL.createObjectURL(blob);',
    '      const a = document.createElement("a");',
    '      a.href = url; a.download = "farblock.csv"; a.click();',
    '      URL.revokeObjectURL(url);',
    '    });',
    '  }, update() {}, unmount() {}, isOpen() { return false; } };',
    '  globalThis.farBuffShield = api;',
    '})();',
  ].join('\n');

  it('accepts browser-only export code and rejects Node shortcuts', async () => {
    const clean = sanitizePageClient(BODY);
    expect(clean.findings).toEqual([]);
    expect(await smokeTestPageClient(clean.code)).toEqual({ ok: true });
    expect(sanitizePageClient(`${BODY}\nBuffer.from("x");`).findings.join(' ')).toMatch(/Buffer/);
    expect(sanitizePageClient(`${BODY}\nprocess.env.X;`).findings.join(' ')).toMatch(/process/);
    expect(sanitizePageClient(`${BODY}\nrequire("fs");`).findings.join(' ')).toMatch(/require/);
    expect(sanitizePageClient(`${BODY}\nexport function f(){}`).findings.join(' ')).toMatch(/export declaration/);
  });
});
