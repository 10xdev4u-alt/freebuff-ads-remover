// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildDomRemoverFromSelectors,
  selectorsForSurfaces,
} from '../src/dom-remover.js';
import {
  AD_CSS_SELECTORS,
  DEFAULT_CONFIG,
  HIDE_ALL_ADS_CSS,
} from '../src/types.js';
import type { AdSurface } from '../src/types.js';
import type { Config } from '../src/config.js';
import { CssInjector } from '../src/css-injector.js';
import { RuleRegistry } from '../src/rule-registry.js';
import { Logger } from '../src/logger.js';
import { AdInterceptor } from '../src/interceptor.js';
import { CssInjector as Css } from '../src/css-injector.js';
import { ElectronHook } from '../src/electron-hook.js';
import { WebContentsScriptTarget } from '../src/web-contents-script.js';

const logger = new Logger('error', false);
const withSurfaces = (patch: Partial<Config['surfaces']>): Config => ({
  ...DEFAULT_CONFIG,
  surfaces: { ...DEFAULT_CONFIG.surfaces, ...patch },
});
const emittedSelectors = (code: string): string[] => {
  const m = code.match(/var selectors = (\[.*?\]);/s);
  return JSON.parse(m?.[1] ?? '[]') as string[];
};

afterEach(() => vi.restoreAllMocks());

describe('per-surface DOM selector scoping', () => {
  it('returns no selectors when every surface is disabled', () => {
    const off = Object.fromEntries(
      Object.keys(DEFAULT_CONFIG.surfaces).map((s) => [s, false]),
    ) as Config['surfaces'];
    expect(selectorsForSurfaces(off)).toEqual([]);
  });

  it('excludes a disabled surface and keeps an enabled one', () => {
    const cfg = withSurfaces({ billboard: false });
    const selectors = selectorsForSurfaces(cfg.surfaces);
    for (const s of AD_CSS_SELECTORS.billboard) expect(selectors).not.toContain(s);
    expect(selectors).toContain('[data-ad-surface="sponsorBreak"]');
  });

  it('emits the exact deduped set for enabled surfaces', () => {
    const cfg = withSurfaces({ billboard: false, sponsoredCard: false });
    const expected = [...new Set(
      Object.entries(cfg.surfaces)
        .filter(([, on]) => on)
        .flatMap(([name]) => AD_CSS_SELECTORS[name as AdSurface]),
    )];
    const actual = selectorsForSurfaces(cfg.surfaces);
    expect([...actual].sort()).toEqual([...expected].sort());
    expect(actual).not.toContain('a.sponsored-ad');
  });

  it('embeds only enabled selectors in the generated script', () => {
    const cfg = withSurfaces({ billboard: false });
    const selectors = emittedSelectors(buildDomRemoverFromSelectors(cfg));
    for (const s of AD_CSS_SELECTORS.billboard) expect(selectors).not.toContain(s);
    expect(selectors).toContain('[data-ad-surface="sponsorBreak"]');
    expect(emittedSelectors(buildDomRemoverFromSelectors())).toEqual(
      [...new Set(Object.values(AD_CSS_SELECTORS).flat())],
    );
  });

  it('keeps the generated script classic-script safe and idempotently guarded', () => {
    const code = buildDomRemoverFromSelectors(withSurfaces({ billboard: false }));
    expect(code.startsWith('(function () {')).toBe(true);
    expect(() => { window.eval(code); }).not.toThrow();
    window.eval(code);
    const first = (window as unknown as { __farBuffDomArmor?: unknown }).__farBuffDomArmor;
    expect(first).toBeDefined();
    window.eval(code);
    expect((window as unknown as { __farBuffDomArmor?: unknown }).__farBuffDomArmor).toBe(first);
    (first as { teardown(): void }).teardown();
    delete (window as unknown as Record<string, unknown>).__farBuffDomArmor;
    delete (window as unknown as Record<string, unknown>).__farBuffDomArmor_v3;
  });
});

describe('per-surface CSS scoping', () => {
  it('keeps the combined-rule fast path for the untouched default registry', async () => {
    const t = { insertCSS: vi.fn().mockResolvedValue('key'), removeCSS: vi.fn().mockResolvedValue(undefined) };
    const injector = new CssInjector(DEFAULT_CONFIG, logger, new RuleRegistry());
    await injector.activate(t);
    expect(t.insertCSS).toHaveBeenCalledTimes(1);
    expect(String(t.insertCSS.mock.calls[0]?.[0])).toBe(HIDE_ALL_ADS_CSS);
    expect(injector.getInjectedSurfaces()).toEqual(['all']);
  });

  it('does not use the global rule when a surface is disabled in the registry', async () => {
    const t = { insertCSS: vi.fn().mockResolvedValue('key'), removeCSS: vi.fn().mockResolvedValue(undefined) };
    const selectors = Object.fromEntries(
      Object.entries(AD_CSS_SELECTORS).filter(([surface]) => surface !== 'billboard'),
    );
    const registry = new RuleRegistry({
      version: 1, endpoints: [], hosts: [], selectors, source: 'test', hash: 'h',
    });
    const injector = new CssInjector(withSurfaces({ billboard: false }), logger, registry);
    await injector.activate(t);
    const css = t.insertCSS.mock.calls.map((c) => String(c[0])).join('\n');
    expect(css).not.toBe(HIDE_ALL_ADS_CSS);
    expect(injector.getInjectedSurfaces()).not.toContain('all');
    for (const s of AD_CSS_SELECTORS.billboard) expect(css).not.toContain(s);
  });
});

describe('DOM remover config hot reload', () => {
  it('re-arms with new selectors instead of leaving the old rule stored', () => {
    const inject = vi.spyOn(WebContentsScriptTarget.prototype, 'injectScript').mockReturnValue('far-script-1');
    const post = vi.spyOn(WebContentsScriptTarget.prototype, 'postScript').mockImplementation(() => {});
    const replace = vi.spyOn(WebContentsScriptTarget.prototype, 'replaceScript').mockImplementation(() => {});
    const listeners = new Map<string, ((...a: unknown[]) => void)[]>();
    const app = {
      whenReady: () => Promise.resolve(),
      on: vi.fn((event: string, l: (...a: unknown[]) => void) => {
        listeners.set(event, [...(listeners.get(event) ?? []), l]);
      }),
      removeListener: vi.fn(),
      getPath: vi.fn(() => undefined),
    };
    const session = { webRequest: {
      onBeforeRequest: vi.fn(), onHeadersReceived: vi.fn(), onBeforeRedirect: vi.fn(),
      onCompleted: vi.fn(), onErrorOccurred: vi.fn(),
    } };
    const hook = new ElectronHook(
      new AdInterceptor(DEFAULT_CONFIG, logger), new Css(DEFAULT_CONFIG, logger), logger,
      undefined, true, withSurfaces({ billboard: false }),
    );
    hook.activate(
      { defaultSession: session },
      { app, webContents: { getAllWebContents: () => [] } },
    );
    expect(inject).toHaveBeenCalled();
    for (const s of AD_CSS_SELECTORS.billboard) {
      expect(emittedSelectors(String(inject.mock.calls[0]?.[0]))).not.toContain(s);
    }
    hook.updateConfig({ ...withSurfaces({ billboard: true }), domRemoval: true });
    expect(post).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('far-script-1', expect.any(String));
    const replacement = String(replace.mock.calls[0]?.[1]);
    expect(emittedSelectors(replacement)).toContain(AD_CSS_SELECTORS.billboard[0]);
    hook.deactivate();
  });

  it('retires and re-injects the DOM rule when domRemoval is toggled', () => {
    const inject = vi.spyOn(WebContentsScriptTarget.prototype, 'injectScript').mockReturnValue('far-script-1');
    const post = vi.spyOn(WebContentsScriptTarget.prototype, 'postScript').mockImplementation(() => {});
    const replace = vi.spyOn(WebContentsScriptTarget.prototype, 'replaceScript').mockImplementation(() => {});
    const app = {
      on: vi.fn(), removeListener: vi.fn(), whenReady: () => Promise.resolve(), getPath: vi.fn(() => undefined),
    };
    const session = { webRequest: {
      onBeforeRequest: vi.fn(), onHeadersReceived: vi.fn(), onBeforeRedirect: vi.fn(),
      onCompleted: vi.fn(), onErrorOccurred: vi.fn(),
    } };
    const hook = new ElectronHook(
      new AdInterceptor(DEFAULT_CONFIG, logger), new Css(DEFAULT_CONFIG, logger), logger,
      undefined, true, { ...DEFAULT_CONFIG, domRemoval: true },
    );
    hook.activate(
      { defaultSession: session },
      { app, webContents: { getAllWebContents: () => [] } },
    );
    hook.updateConfig(DEFAULT_CONFIG);
    expect(replace).toHaveBeenCalledWith('far-script-1', null);
    expect(post).toHaveBeenCalled();
    hook.updateConfig({ ...DEFAULT_CONFIG, domRemoval: true });
    expect(inject).toHaveBeenCalledTimes(2);
    hook.deactivate();
  });
});

describe('stored script replacement', () => {
  it('executes only the replacement on a later navigation', () => {
    const app = { on: vi.fn(), removeListener: vi.fn() };
    const loadListeners: (() => void)[] = [];
    const execute = vi.fn().mockResolvedValue(undefined);
    const contents = {
      getURL: () => 'https://freebuff.com/',
      getType: () => 'renderer',
      isDestroyed: () => false,
      executeJavaScript: execute,
      on: vi.fn((event: string, listener: () => void) => {
        if (event === 'did-finish-load') loadListeners.push(listener);
      }),
    };
    const target = new WebContentsScriptTarget(app as never, () => [contents], logger);
    const id = target.injectScript('var code = 1;');
    expect(execute).toHaveBeenCalledWith('var code = 1;');
    target.replaceScript(id, 'var code = 2;');
    expect(execute).toHaveBeenCalledWith('var code = 2;');
    execute.mockClear();
    for (const listener of loadListeners) listener();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('var code = 2;');
    target.replaceScript(id, null);
    execute.mockClear();
    for (const listener of loadListeners) listener();
    expect(execute).not.toHaveBeenCalled();
    target.dispose();
  });
});

describe('CSS registry promotion', () => {
  it('injects promoted selectors per surface instead of the static combined rule', async () => {
    const t = { insertCSS: vi.fn().mockResolvedValue('key'), removeCSS: vi.fn().mockResolvedValue(undefined) };
    const selectors = Object.fromEntries(
      Object.entries(AD_CSS_SELECTORS).map(([surface, list]) => [surface, [...list, '.promoted-ad']]),
    );
    const registry = new RuleRegistry({
      version: 1, endpoints: [], hosts: [], selectors, source: 'test', hash: 'h',
    });
    const injector = new CssInjector(DEFAULT_CONFIG, logger, registry);
    await injector.activate(t);
    const css = t.insertCSS.mock.calls.map((c) => String(c[0])).join('\n');
    expect(css).toContain('.promoted-ad');
    expect(injector.getInjectedSurfaces()).not.toContain('all');
  });
});
