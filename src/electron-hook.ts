import type { AdInterceptor } from './interceptor.js';
import type { CssInjector } from './css-injector.js';
import type { Dashboard } from './dashboard.js';
import type { Logger } from './logger.js';
import { loadConfig } from './config.js';
import type {
  ElectronAppLike,
  ElectronSessionLike,
  ElectronSessionModuleLike,
  ElectronWebContentsModuleLike,
  ElectronWebContentsLike,
} from './electron-bridge.js';
import { WebContentsCssTarget } from './web-contents-css.js';
import { WebContentsScriptTarget } from './web-contents-script.js';
import { buildDomRemoverFromSelectors } from './dom-remover.js';
import { discoverPartitions } from './partition-scanner.js';
import { createChainTracker } from './redirect-chain.js';

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
  private domRemoval: boolean;
  private logger: Logger;
  private sessions: Set<ElectronSessionLike>;
  private chainTrackers: Map<ElectronSessionLike, ReturnType<typeof createChainTracker>>;
  private cssTarget: WebContentsCssTarget | null;
  private scriptTarget: WebContentsScriptTarget | null;
  private onCreateContents: ((...args: unknown[]) => void) | null;
  private onCreateSession: ((...args: unknown[]) => void) | null;
  private app: ElectronAppLike | null;
  private hookActive: boolean;

  constructor(
    interceptor: AdInterceptor,
    cssInjector: CssInjector,
    logger: Logger,
    dashboard?: Dashboard,
    domRemoval: boolean = false,
  ) {
    this.interceptor = interceptor;
    this.cssInjector = cssInjector;
    this.logger = logger;
    this.dashboard = dashboard ?? null;
    this.domRemoval = domRemoval;
    this.sessions = new Set();
    this.chainTrackers = new Map();
    this.cssTarget = null;
    this.scriptTarget = null;
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

    // Partition discovery (feature-detected).
    try {
      const appLike = electronApi?.app as { getPath?: (n: string) => string } | undefined;
      const userData = appLike?.getPath?.('userData');
      if (userData) {
        const pattern = new RegExp(this.interceptor ? (loadConfig().network.partitionPattern) : '^freebuff-');
        for (const name of discoverPartitions(userData, pattern)) {
          const sm = sessionObj as ElectronSessionModuleLike;
          const fromPartition = sm?.fromPartition;
          if (typeof fromPartition === 'function') {
            try { this.hookSession(fromPartition(name)); } catch { /* ignore */ }
          }
        }
      }
    } catch { /* fail open */ }

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
      this.scriptTarget = new WebContentsScriptTarget(electronApi.app, getAllWebContents, this.logger);
      if (this.domRemoval) {
        this.scriptTarget.injectScript(buildDomRemoverFromSelectors());
      }
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
    if (this.scriptTarget) {
      this.scriptTarget.dispose();
      this.scriptTarget = null;
    }
    this.dashboard?.deactivate();
    this.interceptor.deactivate();
    this.hookActive = false;
    this.cssTarget = null;
    this.scriptTarget = null;
    this.scriptTarget = null;
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
    const tracker = createChainTracker((u) => this.interceptor.isAdUrl(u));
    this.chainTrackers.set(session, tracker);
    const attach = webRequest.onBeforeRequest.bind(webRequest);
    attach({ urls: ['*://*/*'] }, (details, callback) => {
      const d = details as { id?: number; url: string; method?: string };
      if (d.id !== undefined && tracker.isAdChain(d.id)) {
        callback({ cancel: true });
        return;
      }
      const result = this.interceptor.intercept(d.url, d.method ?? 'GET');
      if (d.id !== undefined) tracker.record(d.id, d.url);
      callback(result.blocked ? { cancel: true } : {});
    });
    if (typeof webRequest.onBeforeRedirect === 'function') {
      webRequest.onBeforeRedirect((details) => {
        const d = details as { id?: number; redirectURL?: string };
        if (d.id !== undefined && d.redirectURL) tracker.redirect(d.id, d.redirectURL);
      });
    }
    if (typeof webRequest.onCompleted === 'function') {
      webRequest.onCompleted((details) => {
        const d = details as { id?: number };
        if (d.id !== undefined) tracker.complete(d.id);
      });
    }
    if (typeof webRequest.onErrorOccurred === 'function') {
      webRequest.onErrorOccurred((details) => {
        const d = details as { id?: number };
        if (d.id !== undefined) tracker.complete(d.id);
      });
    }
  }
}
