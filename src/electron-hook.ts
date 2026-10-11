import type { AdInterceptor } from './interceptor.js';
import type { CssInjector } from './css-injector.js';
import type { Logger } from './logger.js';
import type {
  ElectronAppLike,
  ElectronSessionModuleLike,
  ElectronWebContentsModuleLike,
  ElectronWebRequestLike,
} from './electron-bridge.js';
import { WebContentsCssTarget } from './web-contents-css.js';

export interface ElectronApi {
  app: ElectronAppLike;
  webContents?: ElectronWebContentsModuleLike | null;
}

export class ElectronHook {
  private interceptor: AdInterceptor;
  private cssInjector: CssInjector;
  private logger: Logger;
  private webRequest: ElectronWebRequestLike | null;
  private cssTarget: WebContentsCssTarget | null;
  private hookActive: boolean;

  constructor(
    interceptor: AdInterceptor,
    cssInjector: CssInjector,
    logger: Logger,
  ) {
    this.interceptor = interceptor;
    this.cssInjector = cssInjector;
    this.logger = logger;
    this.webRequest = null;
    this.cssTarget = null;
    this.hookActive = false;
  }

  activate(sessionObj: unknown, electronApi?: ElectronApi): void {
    if (this.hookActive) return;

    const sessionModule = sessionObj as ElectronSessionModuleLike | null | undefined;
    const webRequest = sessionModule?.defaultSession?.webRequest;
    if (!webRequest) {
      this.logger.error('Electron session has no webRequest API; extension not activated');
      return;
    }

    this.webRequest = webRequest;
    webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      const result = this.interceptor.intercept(details.url, details.method);
      callback(result.blocked ? { cancel: true } : {});
    });

    this.hookActive = true;
    this.interceptor.activate();

    if (electronApi?.app) {
      const webContentsModule = electronApi.webContents;
      const getAllWebContents = webContentsModule
        ? (): unknown[] => webContentsModule.getAllWebContents()
        : null;
      this.cssTarget = new WebContentsCssTarget(
        electronApi.app,
        getAllWebContents,
        this.logger,
      );
      void this.cssInjector.activate(this.cssTarget);
    } else {
      this.logger.info('CSS fallback skipped: Electron app API not available');
    }

    this.logger.info('Electron session hook activated');
  }

  deactivate(): void {
    if (!this.hookActive || !this.webRequest) return;
    try {
      this.webRequest.onBeforeRequest(null, null);
    } catch (err) {
      this.logger.warn('Failed to remove webRequest hook', err);
    }
    if (this.cssTarget) {
      void this.cssInjector.deactivate(this.cssTarget);
      this.cssTarget.dispose();
    }
    this.interceptor.deactivate();
    this.hookActive = false;
    this.webRequest = null;
    this.cssTarget = null;
    this.logger.info('Electron session hook deactivated');
  }

  isActive(): boolean {
    return this.hookActive;
  }
}
