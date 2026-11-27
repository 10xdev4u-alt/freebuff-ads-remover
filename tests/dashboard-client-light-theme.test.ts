// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import '../src/dashboard-client.js';
import { AD_CSS_SELECTORS } from '../src/types.js';
import type { FarBuffShieldApi } from '../src/types.js';
import { sanitizePageClient, smokeTestPageClient } from '../scripts/page-client-guard.mjs';

const HIDE_SELECTORS = Object.values(AD_CSS_SELECTORS).flat().join(',');
const LIGHT: Record<string, string> = {
  '--far-surface': '#ffffff',
  '--far-surface-2': '#f2f4f7',
  '--far-sunken': '#e9edf2',
  '--far-line': 'rgba(0, 0, 0, 0.10)',
  '--far-line-2': 'rgba(0, 0, 0, 0.16)',
  '--far-txt': '#4b5563',
  '--far-txt-2': '#333b47',
  '--far-txt-3': '#161a22',
  '--far-txt-0': '#7b8494',
  '--far-shadow': '0 3px 0 rgba(16, 19, 24, 0.10)',
};

function api(): FarBuffShieldApi {
  const client = (globalThis as { farBuffShield?: FarBuffShieldApi }).farBuffShield;
  if (!client) throw new Error('dashboard client did not register');
  return client;
}
function panel(): HTMLElement {
  const found = document.querySelector('#far-shield-host')?.shadowRoot?.querySelector('.panel');
  if (!found) throw new Error('panel missing');
  return found as HTMLElement;
}
function styleText(): string {
  const style = document.querySelector('#far-shield-host')?.shadowRoot?.querySelector('style');
  if (!style) throw new Error('style missing');
  return style.textContent;
}

beforeEach(() => {
  api().unmount();
  document.body.innerHTML = '';
  api().install({ hideSelectors: HIDE_SELECTORS });
});

afterEach(() => {
  api().unmount();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('dashboard OS light theme', () => {
  it('ships a CSS-only light theme through prefers-color-scheme', () => {
    const css = styleText();
    expect(css).toContain('@media (prefers-color-scheme: light)');
    expect(css).toContain('--far-surface: #1b1e25;');
  });

  it('declares the expected light tokens inside the media block', () => {
    const css = styleText();
    const start = css.indexOf('@media (prefers-color-scheme: light)');
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start);
    for (const [token, value] of Object.entries(LIGHT)) {
      expect(block, token).toContain(`${token}: ${value};`);
    }
  });

  it('resolves --far-surface and panel background to the light token', () => {
    expect(window.getComputedStyle(panel()).getPropertyValue('--far-surface').trim()).toBe(LIGHT['--far-surface']);
    expect(window.getComputedStyle(panel()).backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('installs with no matchMedia dependency', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => { throw new Error('matchMedia must not be used'); },
    });
    expect(() => { api().install({ hideSelectors: HIDE_SELECTORS }); }).not.toThrow();
    expect(panel()).toBeTruthy();
    expect(fs.readFileSync(path.join(process.cwd(), 'src', 'dashboard-client.ts'), 'utf8')).not.toContain('matchMedia');
  });

  it('keeps the four-key page API', () => {
    expect(Object.keys(api()).sort()).toEqual(['install', 'isOpen', 'unmount', 'update']);
    for (const key of ['install', 'isOpen', 'unmount', 'update'] as const) {
      expect(typeof api()[key]).toBe('function');
    }
  });

  it.runIf(fs.existsSync(path.join(process.cwd(), 'dist', 'dashboard-client.js')))('passes page-client guard and smoke test', async () => {
    const dist = fs.readFileSync(path.join(process.cwd(), 'dist', 'dashboard-client.js'), 'utf8');
    const clean = sanitizePageClient(dist);
    expect(clean.findings).toEqual([]);
    expect(clean.code).toBe(dist);
    expect(await smokeTestPageClient(clean.code)).toEqual({ ok: true });
  });
});
