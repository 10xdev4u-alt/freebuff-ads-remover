import type { AdSurface } from './types.js';
import { AD_CSS_SELECTORS, HIDE_ALL_ADS_CSS } from './types.js';
import type { RuleRegistry } from './rule-registry.js';
import type { Config } from './config.js';
import type { Logger } from './logger.js';

export interface CssInjectionTarget {
  insertCSS(css: string): Promise<string>;
  removeCSS(key: string): Promise<void>;
}

export class CssInjector {
  private config: Config;
  private logger: Logger;
  private injectedKeys: Map<string, string>;
  private active: boolean;
  private registry: RuleRegistry | null;
  private activeTarget: CssInjectionTarget | null;

  constructor(config: Config, logger: Logger, registry: RuleRegistry | null = null) {
    this.config = config;
    this.logger = logger;
    this.injectedKeys = new Map();
    this.active = false;
    this.registry = registry;
    this.activeTarget = null;
  }

  async updateConfig(config: Config): Promise<void> {
    this.config = config;
    // Live config edits must refresh the CSS layer just like the DOM layer.
    if (!this.active || !this.activeTarget) return;
    const target = this.activeTarget;
    for (const [surface, key] of this.injectedKeys) {
      try {
        await target.removeCSS(key);
        this.logger.debug(`Removed CSS for ${surface}`);
      } catch (err) {
        this.logger.warn(`Failed to remove CSS for ${surface}`, err);
      }
    }
    this.injectedKeys.clear();
    await this.injectAll(target);
    this.logger.debug('CSS injector config updated');
  }

  async activate(target: CssInjectionTarget): Promise<void> {
    this.active = true;
    this.activeTarget = target;

    if (this.config.cssFallback) {
      await this.injectAll(target);
    }

    this.logger.info('CSS injector activated');
  }

  async deactivate(target: CssInjectionTarget): Promise<void> {
    this.active = false;
    this.activeTarget = null;

    for (const [surface, key] of this.injectedKeys) {
      try {
        await target.removeCSS(key);
        this.logger.debug(`Removed CSS for ${surface}`);
      } catch (err) {
        this.logger.warn(`Failed to remove CSS for ${surface}`, err);
      }
    }

    this.injectedKeys.clear();
    this.logger.info('CSS injector deactivated');
  }

  private async injectAll(target: CssInjectionTarget): Promise<void> {
    const enabledSurfaces = this.getEnabledSurfaces();

    if (enabledSurfaces.length === 0) {
      return;
    }

    const reg: Record<string, string[]> = this.registry ? this.registry.current().selectors : AD_CSS_SELECTORS;
    const allSurfacesOn = Object.values(this.config.surfaces).every(Boolean);
    const registryIsDefault =
      Object.keys(reg).length === Object.keys(AD_CSS_SELECTORS).length &&
      Object.entries(AD_CSS_SELECTORS).every(
        ([surface, selectors]) => (reg[surface] ?? []).join(',') === selectors.join(','),
      );
    if (allSurfacesOn && registryIsDefault) {
      await this.injectSurface('all', HIDE_ALL_ADS_CSS, target);
      return;
    }

    for (const surface of enabledSurfaces) {
      const css = this.buildSurfaceCss(surface);
      await this.injectSurface(surface, css, target);
    }
  }

  private async injectSurface(
    surface: string,
    css: string,
    target: CssInjectionTarget,
  ): Promise<void> {
    try {
      const key = await target.insertCSS(css);
      this.injectedKeys.set(surface, key);
      this.logger.debug(`Injected CSS for ${surface}`, { key });
    } catch (err) {
      this.logger.warn(`Failed to inject CSS for ${surface}`, err);
    }
  }

  private getEnabledSurfaces(): AdSurface[] {
    if (!this.config.cssFallback) return [];

    return (Object.entries(this.config.surfaces) as [AdSurface, boolean][])
      .filter(([, enabled]) => enabled)
      .map(([surface]) => surface);
  }

  private buildSurfaceCss(surface: AdSurface): string {
    const reg = this.registry ? this.registry.current().selectors : AD_CSS_SELECTORS;
    const selectors = reg[surface];
    if (selectors.length === 0) return '';

    return `${selectors.join(',\n')} {\n  display: none !important;\n  visibility: hidden !important;\n  opacity: 0 !important;\n  pointer-events: none !important;\n  position: absolute !important;\n  z-index: -9999 !important;\n}\n`;
  }

  isActive(): boolean {
    return this.active;
  }

  getInjectedSurfaces(): string[] {
    return Array.from(this.injectedKeys.keys());
  }
}
