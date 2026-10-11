import { loadConfig, watchConfig } from './config.js';
import { Logger } from './logger.js';
import { AdInterceptor } from './interceptor.js';
import { CssInjector } from './css-injector.js';
import { ElectronHook } from './electron-hook.js';

export { AD_SURFACES, AD_ENDPOINTS, PLACEMENT_IDS, DEFAULT_CONFIG } from './types.js';
export type { AdSurface, AdEndpoint, ExtensionConfig, InterceptResult, AdPattern } from './types.js';
export { loadConfig, saveConfig, getConfigPath, getConfigDir, watchConfig } from './config.js';
export type { Config } from './config.js';
export { Logger } from './logger.js';
export { AdInterceptor } from './interceptor.js';
export { CssInjector } from './css-injector.js';
export type { CssInjectionTarget } from './css-injector.js';
export { ElectronHook } from './electron-hook.js';

let logger: Logger | null = null;
let interceptor: AdInterceptor | null = null;
let cssInjector: CssInjector | null = null;
let electronHook: ElectronHook | null = null;
let unwatchConfig: (() => void) | null = null;

export function activate(session?: unknown): boolean {
  try {
    const config = loadConfig();

    logger = new Logger(config.logLevel, config.logToFile);
    logger.info('Freebuff Ads Remover activating...');

    interceptor = new AdInterceptor(config, logger);
    cssInjector = new CssInjector(config, logger);
    electronHook = new ElectronHook(interceptor, cssInjector, logger);

    if (session) {
      electronHook.activate(session as never);
    }

    unwatchConfig = watchConfig((newConfig) => {
      logger?.info('Config changed, reloading...');
      interceptor?.updateConfig(newConfig);
      cssInjector?.updateConfig(newConfig);
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
    unwatchConfig = null;
  }
}

export function getStats(): { requestCount: number; blockCount: number; patterns: number } | null {
  return interceptor?.getStats() ?? null;
}

export function isElectronAvailable(): boolean {
  try {
    return typeof process !== 'undefined' && !!process.versions?.electron;
  } catch {
    return false;
  }
}

if (isElectronAvailable()) {
  try {
    const electron = require('electron') as {
      app: { whenReady: () => Promise<void>; on: (event: string, cb: () => void) => void };
      session: unknown;
    };
    electron.app.whenReady().then(() => {
      activate(electron.session);
    }).catch((err: unknown) => {
      console.error('[freebuff-ads-remover] App ready failed:', err);
    });
  } catch (err) {
    console.error('[freebuff-ads-remover] Failed to load electron:', err);
  }
}
