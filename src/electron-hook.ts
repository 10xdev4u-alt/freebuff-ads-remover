import type { AdInterceptor } from './interceptor.js';
import type { CssInjector } from './css-injector.js';
import type { Dashboard } from './dashboard.js';
import type { Logger } from './logger.js';
import type {
  ElectronAppLike,
  ElectronSessionLike,
  ElectronSessionModuleLike,
  ElectronWebContentsModuleLike,
  ElectronWebContentsLike,
} from './electron-bridge.js';
import { WebContentsCssTarget } from './web-contents-css.js';

export interface ElectronApi {
  app: ElectronAppLike;
  webContents?: ElectronWebContentsModuleLike | null;
}

/**
 * Hooks every session the app makes ad requests from. `defaultSession` covers
 * the locally served UI; the hosted workspace runs in its own persisted
 * partition, so its session is picked up from its webContents (or from
 * Electron's `session-created` event where the runtime emits it).
 */
export class ElectronHook {
  private interceptor: AdInterceptor;
  private cssInjector: CssInjector;
  private dashboard: Dashboard | null;
  private logger: Logger;
  private sessions: Set<ElectronSessionLike>;
  private cssTarget: WebContentsCssTarget | null;
  private onCreateContents: ((...args: unknown[]) => void) | null;
  private onCreateSession: ((...args: unknown[]) => void) | null;
  private app: ElectronAppLike | null;
  private hookActive: boolean;

  constructor(
    interceptor: AdInterceptor,
    cssInjector: CssInjector,
    logger: Logger,
    dashboard?: Dashboard,
  ) {
    this.interceptor = interceptor;
    this.cssInjector = cssInjector;
    this.logger = logger;
    this.dashboard = dashboard ?? null;
    this.sessions = new Set();
    this.cssTarget = null;
    this.onCreateContents = null;
    this.onCreateSession = null;
    this.app = null;
    this.hookActive = false;
  }

  activate(sessionObj: unknown, electronApi?: ElectronApi): void {
    if (this.hookActive) return;

    const sessionModule = sessionObj as ElectronSessionModuleLike | null | undefined;
    const defaultSession = sessionModule?.defaultSession;
    if (!defaultSession?.webRequest) {
      this.logger.error('Electron session has no webRequest API; extension not activated');
      return;
    }

    this.hookSession(defaultSession);

    if (electronApi?.app) {
      this.app = electronApi.app;
      this.onCreateContents = (_event: unknown, contents: unknown): void => {
        this.hookContentsSession(contents);
      };
      this.onCreateSession = (_event: unknown, session: unknown): void => {
        this.hookSession(session);
      };
      electronApi.app.on('web-contents-created', this.onCreateContents);
      electronApi.app.on('session-created', this.onCreateSession);

      for (const contents of electronApi.webContents?.getAllWebContents() ?? []) {
        this.hookContentsSession(contents);
      }
    }

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
      this.dashboard?.activate(electronApi.app, getAllWebContents);
    } else {
      this.logger.info('CSS fallback skipped: Electron app API not available');
    }

    this.logger.info('Electron session hook activated', { sessions: this.sessions.size });
  }

  deactivate(): void {
    if (!this.hookActive) return;
    for (const session of this.sessions) {
      try {
        session.webRequest?.onBeforeRequest(null, null);
      } catch (err) {
        this.logger.warn('Failed to remove webRequest hook', err);
      }
    }
    this.sessions.clear();
    if (this.app) {
      if (this.onCreateContents) {
        this.app.removeListener('web-contents-created', this.onCreateContents);
      }
      if (this.onCreateSession) {
        this.app.removeListener('session-created', this.onCreateSession);
      }
    }
    if (this.cssTarget) {
      void this.cssInjector.deactivate(this.cssTarget);
      this.cssTarget.dispose();
    }
    this.dashboard?.deactivate();
    this.interceptor.deactivate();
    this.hookActive = false;
    this.cssTarget = null;
    this.onCreateContents = null;
    this.onCreateSession = null;
    this.app = null;
    this.logger.info('Electron session hook deactivated');
  }

  isActive(): boolean {
    return this.hookActive;
  }

  /** Number of sessions whose webRequest is hooked (default + partitions). */
  getSessionCount(): number {
    return this.sessions.size;
  }

  private hookContentsSession(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const contents = raw as ElectronWebContentsLike;
    if (contents.session) this.hookSession(contents.session);
  }

  private hookSession(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const session = raw as ElectronSessionLike;
    if (this.sessions.has(session)) return;
    const webRequest = session.webRequest;
    if (!webRequest) return;
    this.sessions.add(session);
    this.logger.debug('Session hooked', { sessions: this.sessions.size });
    const attach = webRequest.onBeforeRequest.bind(webRequest);
    attach({ urls: ['*://*/*'] }, (details, callback) => {
      const result = this.interceptor.intercept(details.url, details.method);
      callback(result.blocked ? { cancel: true } : {});
    });
  }
}
