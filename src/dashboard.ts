import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ElectronAppLike } from './electron-bridge.js';
import type { Logger } from './logger.js';
import type { StatsStore } from './stats-store.js';
import { WebContentsScriptTarget } from './web-contents-script.js';
import { AD_CSS_SELECTORS } from './types.js';

export const HIDE_SELECTORS = Object.values(AD_CSS_SELECTORS).flat().join(',');

/**
 * Extension version for the dashboard header. Reads the repo package.json
 * (one level above dist/); empty when unreadable so the client hides it.
 */
export function loadPackageVersion(): string {
  try {
    if (typeof __dirname !== 'string') return '';
    const candidate = join(__dirname, '..', 'package.json');
    if (!existsSync(candidate)) return '';
    const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}

/**
 * The compiled client lives next to this module in dist/. The typeof guard
 * keeps unit tests (ESM, no __dirname) on a safe empty path instead of
 * throwing.
 */
export function loadClientSource(): string {
  try {
    if (typeof __dirname !== 'string') return '';
    const candidate = join(__dirname, 'dashboard-client.js');
    if (!existsSync(candidate)) return '';
    return readFileSync(candidate, 'utf8');
  } catch {
    return '';
  }
}

export interface DashboardOptions {
  clientSource?: string;
  intervalMs?: number;
  enabled?: boolean;
}

/**
 * Owns the page-side shield dashboard: injects the client into app-origin
 * webContents and pushes stats snapshots once per second.
 */
export class Dashboard {
  private readonly stats: StatsStore;
  private readonly logger: Logger;
  private readonly clientSource: string | undefined;
  private readonly intervalMs: number;
  private enabled: boolean;
  private target: WebContentsScriptTarget | null;
  private timer: ReturnType<typeof setInterval> | null;
  private app: ElectronAppLike | null;
  private getAllWebContents: (() => unknown[]) | null;
  private active: boolean;

  constructor(stats: StatsStore, logger: Logger, options: DashboardOptions = {}) {
    this.stats = stats;
    this.logger = logger;
    this.clientSource = options.clientSource;
    this.intervalMs = options.intervalMs ?? 1000;
    this.enabled = options.enabled ?? true;
    this.target = null;
    this.timer = null;
    this.app = null;
    this.getAllWebContents = null;
    this.active = false;
  }

  activate(app: ElectronAppLike, getAllWebContents: (() => unknown[]) | null): void {
    this.app = app;
    this.getAllWebContents = getAllWebContents;
    if (!this.enabled) {
      this.logger.debug('Dashboard disabled by config');
      return;
    }
    this.start();
  }

  deactivate(): void {
    this.stop();
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!this.app) return;
    if (enabled) {
      this.start();
    } else {
      this.stop();
    }
  }

  push(): void {
    if (!this.active || !this.target) return;
    const json = JSON.stringify(this.stats.snapshot());
    this.target.postScript(`globalThis.farBuffShield && globalThis.farBuffShield.update(${json});`);
  }

  isActive(): boolean {
    return this.active;
  }

  private start(): void {
    if (this.active || !this.app) return;
    const source = this.clientSource ?? loadClientSource();
    if (source) {
      const install = JSON.stringify({ hideSelectors: HIDE_SELECTORS, version: loadPackageVersion() });
      this.target = new WebContentsScriptTarget(this.app, this.getAllWebContents, this.logger);
      this.target.injectScript(
        `${source}\n;globalThis.farBuffShield && globalThis.farBuffShield.install(${install});`,
      );
    } else {
      this.logger.warn('Dashboard client source not found; stats panel unavailable');
    }
    this.timer = setInterval(() => {
      this.push();
    }, this.intervalMs);
    this.active = true;
    this.logger.info('Dashboard activated');
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.target) {
      this.target.postScript('globalThis.farBuffShield && globalThis.farBuffShield.unmount();');
      this.target.dispose();
      this.target = null;
    }
    if (this.active) {
      this.logger.info('Dashboard deactivated');
    }
    this.active = false;
  }
}
