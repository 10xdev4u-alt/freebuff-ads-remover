import type { session } from 'electron';
import type { AdInterceptor } from './interceptor.js';
import type { CssInjector, CssInjectionTarget } from './css-injector.js';
import type { Logger } from './logger.js';

type Session = typeof session;

export class ElectronHook {
  private interceptor: AdInterceptor;
  private cssInjector: CssInjector;
  private logger: Logger;
  private session: ReturnType<Session['fromPartition']> | null;
  private cssTarget: CssInjectionTarget | null;
  private hookActive: boolean;

  constructor(
    interceptor: AdInterceptor,
    cssInjector: CssInjector,
    logger: Logger,
  ) {
    this.interceptor = interceptor;
    this.cssInjector = cssInjector;
    this.logger = logger;
    this.session = null;
    this.cssTarget = null;
    this.hookActive = false;
  }

  activate(sessionObj: Session): void {
    if (this.hookActive) return;

    this.session = sessionObj.defaultSession;
    this.cssTarget = this.session as unknown as CssInjectionTarget;

    this.session.webRequest.onBeforeRequest(
      { urls: ['*://*/*'] },
      (details: { url: string; method: string }, callback: (response: { cancel?: boolean }) => void) => {
        const result = this.interceptor.intercept(details.url, details.method);

        if (result.blocked) {
          callback({ cancel: true });
          return;
        }

        callback({});
      },
    );

    this.hookActive = true;
    this.interceptor.activate();
    void this.cssInjector.activate(this.cssTarget);

    this.logger.info('Electron session hook activated');
  }

  deactivate(): void {
    if (!this.hookActive || !this.session) return;

    try {
      this.session.webRequest.onBeforeRequest(null);
    } catch (err) {
      this.logger.warn('Failed to remove webRequest hook', err);
    }

    if (this.cssTarget) {
      void this.cssInjector.deactivate(this.cssTarget);
    }

    this.interceptor.deactivate();
    this.hookActive = false;
    this.session = null;
    this.cssTarget = null;

    this.logger.info('Electron session hook deactivated');
  }

  isActive(): boolean {
    return this.hookActive;
  }
}
