// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/dashboard-client.js';
import { AD_CSS_SELECTORS } from '../src/types.js';
import type { FarBuffShieldApi } from '../src/types.js';
import { sanitizePageClient, smokeTestPageClient } from '../scripts/page-client-guard.mjs';

const HIDE_SELECTORS = Object.values(AD_CSS_SELECTORS).flat().join(',');

function api(): FarBuffShieldApi {
  const client = (globalThis as { farBuffShield?: FarBuffShieldApi }).farBuffShield;
  if (!client) throw new Error('dashboard client did not register');
  return client;
}

function shadowEl(sel: string): HTMLElement {
  const found = document.querySelector('#far-shield-host')?.shadowRoot?.querySelector(sel);
  if (!found) throw new Error(`shadow element not found: ${sel}`);
  return found as HTMLElement;
}

function press(opts: Partial<KeyboardEventInit> = {}, target: EventTarget = document.body): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'd', code: 'KeyD', altKey: true, shiftKey: true,
    bubbles: true, cancelable: true, ...opts,
  });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  api().unmount();
  document.body.innerHTML = '';
  api().install({ hideSelectors: HIDE_SELECTORS });
});

afterEach(() => {
  api().unmount();
  document.body.innerHTML = '';
});

describe('in-page dashboard shortcut', () => {
  it('Alt+Shift+D toggles the panel through the same state as the badge', () => {
    expect(shadowEl('.panel').hasAttribute('hidden')).toBe(true);
    const open = press();
    expect(open.defaultPrevented).toBe(true);
    expect(api().isOpen()).toBe(true);
    expect(shadowEl('.panel').hasAttribute('hidden')).toBe(false);
    expect(shadowEl('.badge').getAttribute('aria-expanded')).toBe('true');
    press();
    expect(api().isOpen()).toBe(false);
    expect(shadowEl('.badge').getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores key events that are not the exact combo', () => {
    const wrong: Partial<KeyboardEventInit>[] = [
      { altKey: false, shiftKey: false },
      { altKey: false },
      { shiftKey: false },
      { key: 'x', code: 'KeyX' },
      { ctrlKey: true },
      { metaKey: true },
    ];
    for (const opts of wrong) {
      const event = press(opts);
      expect(event.defaultPrevented).toBe(false);
      expect(api().isOpen()).toBe(false);
    }
    expect(press().defaultPrevented).toBe(true);
    expect(api().isOpen()).toBe(true);
  });

  it('ignores the combo while an editable field has focus', () => {
    for (const html of ['<input>', '<textarea>', '<select>', '<div contenteditable="true">x</div>', '<div contenteditable="">x</div>']) {
      const node = document.createElement('div');
      node.innerHTML = html;
      const editable = node.firstElementChild as HTMLElement;
      document.body.appendChild(editable);
      editable.focus();
      const event = press({}, editable);
      expect(event.defaultPrevented).toBe(false);
      expect(api().isOpen()).toBe(false);
      editable.remove();
    }
    expect(press().defaultPrevented).toBe(true);
    expect(api().isOpen()).toBe(true);
  });

  it('removes the document listener on unmount', () => {
    expect(press().defaultPrevented).toBe(true);
    expect(api().isOpen()).toBe(true);
    api().unmount();
    expect(document.querySelector('#far-shield-host')).toBeNull();
    expect(() => { press(); }).not.toThrow();
    expect(api().isOpen()).toBe(false);
  });

  it('does not accumulate handlers across reinstalls', () => {
    api().install({ hideSelectors: HIDE_SELECTORS });
    press();
    expect(api().isOpen()).toBe(true);
    api().unmount();
    api().install({ hideSelectors: HIDE_SELECTORS });
    press();
    expect(api().isOpen()).toBe(true);
  });

  it('keeps the four-key API and does not change the selected view', () => {
    expect(Object.keys(api()).sort()).toEqual(['install', 'isOpen', 'unmount', 'update']);
    shadowEl('[data-view-btn="ledger"]').click();
    expect(shadowEl('.panel').getAttribute('data-view')).toBe('ledger');
    press();
    expect(shadowEl('.panel').getAttribute('data-view')).toBe('ledger');
    expect(api().isOpen()).toBe(true);
  });
});

describe('shortcut code is page-safe', () => {
  const BODY = [
    '(() => {',
    '  let handler = null;',
    '  const api = {',
    '    install() {',
    '      document.body.addEventListener("keydown", (event) => {',
    '        if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return;',
    '        if (String(event.key).toLowerCase() !== "d") return;',
    '        if (document.activeElement?.closest("input,textarea,select,[contenteditable]")) return;',
    '        event.preventDefault();',
    '      });',
    '    },',
    '    update() {},',
    '    unmount() { if (handler) document.body.removeEventListener("keydown", handler); },',
    '    isOpen() { return false; }',
    '  };',
    '  globalThis.farBuffShield = api;',
    '})();',
  ].join('\n');

  it('accepts browser-only key handling and rejects Node shortcuts', async () => {
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
