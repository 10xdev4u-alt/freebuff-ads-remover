import type { AdSurface } from './types.js';
import { AD_CSS_SELECTORS, HIDE_ALL_ADS_CSS } from './types.js';
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

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.injectedKeys = new Map();
    this.active = false;
  }

  updateConfig(config: Config): void {
    this.config = config;
    this.logger.debug('CSS injector config updated');
  }

  async activate(target: CssInjectionTarget): Promise<void> {
    this.active = true;

    if (this.config.cssFallback) {
      await this.injectAll(target);
    }

    this.logger.info('CSS injector activated');
  }

  async deactivate(target: CssInjectionTarget): Promise<void> {
    this.active = false;

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

    if (enabledSurfaces.length === Object.keys(AD_CSS_SELECTORS).length) {
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
    const selectors = AD_CSS_SELECTORS[surface];
    if (!selectors || selectors.length === 0) return '';

    return `${selectors.join(',\n')} {\n  display: none !important;\n  visibility: hidden !important;\n  opacity: 0 !important;\n  pointer-events: none !important;\n  position: absolute !important;\n  z-index: -9999 !important;\n}\n`;
  }

  isActive(): boolean {
    return this.active;
  }

  getInjectedSurfaces(): string[] {
    return Array.from(this.injectedKeys.keys());
  }
}
