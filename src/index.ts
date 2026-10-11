import { loadConfig, watchConfig } from './config.js';
import { Logger } from './logger.js';
import { AdInterceptor } from './interceptor.js';
import { CssInjector } from './css-injector.js';
import { Dashboard } from './dashboard.js';
import { StatsStore } from './stats-store.js';
import { ElectronHook } from './electron-hook.js';
import type { ElectronApi } from './electron-hook.js';
import type { StatsSnapshot } from './types.js';
import { getElectron } from './electron-bridge.js';

export { AD_SURFACES, AD_ENDPOINTS, AD_STAGES, PLACEMENT_IDS, DEFAULT_CONFIG, PIPELINE_STAGES, STAGE_LABELS, stageForEndpoint } from './types.js';
export type { AdSurface, AdEndpoint, AdStage, ExtensionConfig, InterceptResult, AdPattern, BlockEvent, StatsSnapshot, FarBuffShieldApi } from './types.js';
export { loadConfig, saveConfig, getConfigPath, getConfigDir, watchConfig } from './config.js';
export type { Config } from './config.js';
export { Logger } from './logger.js';
export { AdInterceptor } from './interceptor.js';
export { CssInjector } from './css-injector.js';
export type { CssInjectionTarget } from './css-injector.js';
export { Dashboard, HIDE_SELECTORS, loadClientSource } from './dashboard.js';
export { StatsStore } from './stats-store.js';
export { ElectronHook } from './electron-hook.js';
export type { ElectronApi } from './electron-hook.js';
export { WebContentsCssTarget } from './web-contents-css.js';
export { WebContentsScriptTarget } from './web-contents-script.js';

let logger: Logger | null = null;
let interceptor: AdInterceptor | null = null;
let cssInjector: CssInjector | null = null;
let statsStore: StatsStore | null = null;
let dashboard: Dashboard | null = null;
let electronHook: ElectronHook | null = null;
let unwatchConfig: (() => void) | null = null;

export function activate(session?: unknown, electronApi?: ElectronApi): boolean {
  try {
    const config = loadConfig();
    logger = new Logger(config.logLevel, config.logToFile);
    logger.info('Freebuff Ads Remover activating...');
    statsStore = new StatsStore();
    interceptor = new AdInterceptor(config, logger, statsStore);
    cssInjector = new CssInjector(config, logger);
    dashboard = new Dashboard(statsStore, logger, { enabled: config.dashboard });
    electronHook = new ElectronHook(interceptor, cssInjector, logger, dashboard);
    if (session) {
      electronHook.activate(session, electronApi);
    }
    unwatchConfig = watchConfig((newConfig) => {
      logger?.info('Config changed, reloading...');
      interceptor?.updateConfig(newConfig);
      cssInjector?.updateConfig(newConfig);
      dashboard?.setEnabled(newConfig.dashboard);
      logger?.setLevel(newConfig.logLevel);
      logger?.setLogToFile(newConfig.logToFile);
    });
    logger.info('Freebuff Ads Remover activated successfully');
    return true;
  } catch (err) {
    console.error('[freebuff-ads-remover] Activation failed:', err);
    return false;
  }
}

export function deactivate(): void {
  try {
    electronHook?.deactivate();
    unwatchConfig?.();
    logger?.info('Freebuff Ads Remover deactivated');
  } catch (err) {
    console.error('[freebuff-ads-remover] Deactivation failed:', err);
  } finally {
    electronHook = null;
    interceptor = null;
    cssInjector = null;
    statsStore = null;
    dashboard = null;
    unwatchConfig = null;
  }
}

export function getStats(): { requestCount: number; blockCount: number; patterns: number } | null {
  return interceptor?.getStats() ?? null;
}

export function getShieldSnapshot(): StatsSnapshot | null {
  return statsStore?.snapshot() ?? null;
}

export function isElectronAvailable(): boolean {
  try {
    return typeof process !== 'undefined' && !!process.versions.electron;
  } catch {
    return false;
  }
}

if (isElectronAvailable()) {
  const electron = getElectron();
  if (electron) {
    void electron.app
      .whenReady()
      .then(() => {
        activate(electron.session, electron);
      })
      .catch((err: unknown) => {
        console.error('[freebuff-ads-remover] app.whenReady failed:', err);
      });
  }
}
