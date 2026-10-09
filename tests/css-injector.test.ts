import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CssInjector } from '../src/css-injector.js';
import { DEFAULT_CONFIG, HIDE_ALL_ADS_CSS, AD_CSS_SELECTORS } from '../src/types.js';
import { Logger } from '../src/logger.js';
import type { CssInjectionTarget } from '../src/css-injector.js';

describe('CssInjector', () => {
  let injector: CssInjector;
  let logger: Logger;
  let mockTarget: CssInjectionTarget;

  beforeEach(() => {
    logger = new Logger('error', false);
    injector = new CssInjector(DEFAULT_CONFIG, logger);
    mockTarget = {
      insertCSS: vi.fn().mockResolvedValue('test-key'),
      removeCSS: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('activates with CSS fallback enabled', async () => {
    await injector.activate(mockTarget);
    expect(injector.isActive()).toBe(true);
    expect(mockTarget.insertCSS).toHaveBeenCalled();
  });

  it('does not inject CSS when cssFallback is disabled', async () => {
    const config = { ...DEFAULT_CONFIG, cssFallback: false };
    const noCssInjector = new CssInjector(config, logger);
    await noCssInjector.activate(mockTarget);
    expect(mockTarget.insertCSS).not.toHaveBeenCalled();
  });

  it('injects CSS for all surfaces when all enabled', async () => {
    await injector.activate(mockTarget);
    const callArgs = (mockTarget.insertCSS as ReturnType<typeof vi.fn>).mock.calls;
    expect(callArgs.length).toBeGreaterThan(0);
  });

  it('removes all CSS on deactivate', async () => {
    await injector.activate(mockTarget);
    await injector.deactivate(mockTarget);
    expect(mockTarget.removeCSS).toHaveBeenCalled();
    expect(injector.isActive()).toBe(false);
  });

  it('tracks injected surfaces', async () => {
    await injector.activate(mockTarget);
    const surfaces = injector.getInjectedSurfaces();
    expect(surfaces.length).toBeGreaterThan(0);
  });

  it('updates config dynamically', async () => {
    injector.updateConfig({ ...DEFAULT_CONFIG, cssFallback: false });
    await injector.activate(mockTarget);
    expect(mockTarget.insertCSS).not.toHaveBeenCalled();
  });

  it('handles insertCSS failure gracefully', async () => {
    const failingTarget: CssInjectionTarget = {
      insertCSS: vi.fn().mockRejectedValue(new Error('CSS injection failed')),
      removeCSS: vi.fn().mockResolvedValue(undefined),
    };
    await injector.activate(failingTarget);
    expect(injector.isActive()).toBe(true);
  });

  it('handles removeCSS failure gracefully', async () => {
    await injector.activate(mockTarget);
    const failingTarget: CssInjectionTarget = {
      insertCSS: vi.fn().mockResolvedValue('key'),
      removeCSS: vi.fn().mockRejectedValue(new Error('Remove failed')),
    };
    await expect(injector.deactivate(failingTarget)).resolves.not.toThrow();
  });
});

describe('HIDE_ALL_ADS_CSS', () => {
  it('contains display none', () => {
    expect(HIDE_ALL_ADS_CSS).toContain('display: none !important');
  });

  it('contains visibility hidden', () => {
    expect(HIDE_ALL_ADS_CSS).toContain('visibility: hidden !important');
  });

  it('covers all ad surfaces', () => {
    for (const selectors of Object.values(AD_CSS_SELECTORS)) {
      for (const selector of selectors) {
        expect(HIDE_ALL_ADS_CSS).toContain(selector);
      }
    }
  });
});

describe('AD_CSS_SELECTORS', () => {
  it('has selectors for all surfaces', () => {
    const surfaces = Object.keys(AD_CSS_SELECTORS);
    expect(surfaces).toContain('sponsorBreak');
    expect(surfaces).toContain('billboard');
    expect(surfaces).toContain('intermission');
    expect(surfaces).toContain('spotlight');
    expect(surfaces).toContain('showcase');
  });

  it('each surface has multiple selectors', () => {
    for (const selectors of Object.values(AD_CSS_SELECTORS)) {
      expect(selectors.length).toBeGreaterThan(0);
    }
  });
});
