import { describe, it, expect, vi } from 'vitest';
import { CssInjector } from '../src/css-injector.js';
import { RuleRegistry } from '../src/rule-registry.js';
import { Logger } from '../src/logger.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import type { Config } from '../src/config.js';
import type { CssInjectionTarget } from '../src/css-injector.js';

const logger = new Logger('error', false);

function target(): CssInjectionTarget & { insertCSS: ReturnType<typeof vi.fn> } {
  return { insertCSS: vi.fn().mockResolvedValue('key'), removeCSS: vi.fn().mockResolvedValue(undefined) };
}

function config(patch: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...patch };
}

describe('CssInjector extra branches', () => {
  it('injects nothing when every surface is disabled', async () => {
    const t = target();
    const allOff = Object.fromEntries(Object.keys(DEFAULT_CONFIG.surfaces).map((s) => [s, false]));
    const injector = new CssInjector(config({ surfaces: allOff as Config['surfaces'] }), logger);
    await injector.activate(t);
    expect(t.insertCSS).not.toHaveBeenCalled();
    expect(injector.getInjectedSurfaces()).toEqual([]);
  });

  it('injects per-surface CSS when only some surfaces are enabled', async () => {
    const t = target();
    const injector = new CssInjector(
      config({ surfaces: { ...DEFAULT_CONFIG.surfaces, billboard: false } }),
      logger,
    );
    await injector.activate(t);
    const injected = injector.getInjectedSurfaces();
    expect(injected).not.toContain('billboard');
    expect(injected.length).toBe(Object.keys(DEFAULT_CONFIG.surfaces).length - 1);
  });

  it('uses the registry selectors and skips a surface with none', async () => {
    const t = target();
    const selectors = Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.surfaces).map(([surface]) => [surface, ['[data-ad]']]),
    );
    selectors.sponsorBreak = [];
    const registry = new RuleRegistry({
      version: 1,
      endpoints: [],
      hosts: [],
      selectors,
      source: 'test',
      hash: 'h',
    });
    const injector = new CssInjector(
      config({ surfaces: { ...DEFAULT_CONFIG.surfaces, billboard: false } }),
      logger,
      registry,
    );
    await injector.activate(t);
    expect(t.insertCSS).toHaveBeenCalled();
    const cssCalls = t.insertCSS.mock.calls.map((call) => String(call[0]));
    expect(cssCalls.filter((css) => css === '')).toHaveLength(1);
    expect(cssCalls.filter((css) => css !== '').every((css) => css.includes('[data-ad]'))).toBe(true);
  });

  it('honours a registry whose selector set matches the enabled surfaces', async () => {
    const t = target();
    const registry = new RuleRegistry();
    const injector = new CssInjector(config(), logger, registry);
    await injector.activate(t);
    expect(t.insertCSS).toHaveBeenCalledTimes(1);
    expect(String(t.insertCSS.mock.calls[0]?.[0])).toContain('display: none !important');
  });
});
