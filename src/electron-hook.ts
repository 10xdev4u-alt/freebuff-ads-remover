/* eslint-disable @typescript-eslint/consistent-type-imports */
import type { AdInterceptor } from './interceptor.js';
import type { CssInjector } from './css-injector.js';
import type { Dashboard } from './dashboard.js';
import type { Logger } from './logger.js';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import type {
  ElectronAppLike,
  ElectronSessionLike,
  ElectronSessionModuleLike,
  ElectronWebContentsModuleLike,
  ElectronWebContentsLike,
} from './electron-bridge.js';
import { WebContentsCssTarget } from './web-contents-css.js';
import { WebContentsScriptTarget } from './web-contents-script.js';
import { buildDomRemoverFromSelectors, selectorsForSurfaces } from './dom-remover.js';
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
  private config: Config;
  private domRuleId: string | null;
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
    config: Config = loadConfig(),
  ) {
    this.interceptor = interceptor;
    this.cssInjector = cssInjector;
    this.logger = logger;
    this.dashboard = dashboard ?? null;
    this.domRemoval = domRemoval;
    this.config = config;
    this.domRuleId = null;
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
        const pattern = new RegExp(this.config.network.partitionPattern);
        for (const name of discoverPartitions(userData, pattern)) {
          const sm = sessionObj as ElectronSessionModuleLike;
          if (typeof sm.fromPartition === 'function') {
            try { this.hookSession(sm.fromPartition(name)); } catch { /* ignore */ }
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
        loadConfig().cssFallbackHosted,
      );
      void this.cssInjector.activate(this.cssTarget);
      this.scriptTarget = new WebContentsScriptTarget(electronApi.app, getAllWebContents, this.logger);
      if (this.domRemoval && selectorsForSurfaces(this.config.surfaces).length > 0) {
        this.domRuleId = this.scriptTarget.injectScript(buildDomRemoverFromSelectors(this.config));
      }
      this.dashboard?.activate(electronApi.app, getAllWebContents);
    } else {
      this.logger.info('CSS fallback skipped: Electron app API not available');
    }

    this.logger.info('Electron session hook activated', { sessions: this.sessions.size });
  }

  /**
   * Re-scope or retire the injected DOM remover when config changes. The old
   * rule must be torn down before replacement, otherwise its stored script
   * re-arms on the next navigation.
   */
  updateConfig(config: Config): void {
    this.config = config;
    this.domRemoval = config.domRemoval;
    if (!this.hookActive || !this.scriptTarget) return;
    const teardown = 'window.__farBuffDomArmor&&window.__farBuffDomArmor.teardown();';
    const enabled = this.domRemoval && selectorsForSurfaces(config.surfaces).length > 0;
    if (!enabled) {
      if (this.domRuleId) {
        this.scriptTarget.postScript(teardown);
        this.scriptTarget.replaceScript(this.domRuleId, null);
        this.domRuleId = null;
      }
      return;
    }
    const code = buildDomRemoverFromSelectors(config);
    if (this.domRuleId) {
      this.scriptTarget.postScript(teardown);
      this.scriptTarget.replaceScript(this.domRuleId, code);
    } else {
      this.domRuleId = this.scriptTarget.injectScript(code);
    }
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
    this.domRuleId = null;
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
    // Re-arm after the hosted workspace wipes onBeforeRequest on navigation.
    const wc = raw as { on?: (e: string, l: (...a: unknown[]) => void) => unknown };
    if (typeof wc.on === 'function') {
      wc.on('did-finish-load', () => {
        if (contents.session) this.hookSession(contents.session);
      });
    }
  }

  private handleBeforeRequest(
    tracker: ReturnType<typeof createChainTracker>,
    d: { id?: number; url: string; method?: string },
    callback: (response: { cancel?: boolean }) => void,
  ): void {
    if (d.id !== undefined && tracker.isAdChain(d.id)) {
      callback({ cancel: true });
      return;
    }
    try {
      const result = this.interceptor.intercept(d.url, d.method ?? 'GET');
      if (d.id !== undefined) tracker.record(d.id, d.url);
      callback(result.blocked ? { cancel: true } : {});
    } catch (e) {
      // Electron waits on this callback; skipping it hangs the request.
      this.logger.error('Intercept threw; allowing request so the callback is not skipped', {
        url: d.url,
        error: String(e),
      });
      callback({});
    }
  }

  private hookSession(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const session = raw as ElectronSessionLike;
    const webRequest = session.webRequest;
    if (!webRequest) return;

    // Re-arm path: the hosted workspace wipes onBeforeRequest (calls
    // onBeforeRequest(null)) after we hook it. Re-attach the listener instead
    // of bailing out, so network blocking survives.
    if (this.sessions.has(session)) {
      const tracker = this.chainTrackers.get(session) ?? createChainTracker((u) => this.interceptor.isAdUrl(u));
      this.chainTrackers.set(session, tracker);
      const attach = webRequest.onBeforeRequest.bind(webRequest);
      attach({ urls: ['*://*/*'] }, (details, callback) => {
        this.handleBeforeRequest(tracker, details, callback);
      });
      this.logger.debug('Session re-armed', { sessions: this.sessions.size });
      return;
    }

    this.sessions.add(session);
    this.logger.debug('Session hooked', { sessions: this.sessions.size });
    const tracker = createChainTracker((u) => this.interceptor.isAdUrl(u));
    this.chainTrackers.set(session, tracker);
    const attach = webRequest.onBeforeRequest.bind(webRequest);
    attach({ urls: ['*://*/*'] }, (details, callback) => {
      this.handleBeforeRequest(tracker, details, callback);
    });
    if (typeof webRequest.onHeadersReceived === 'function') {
      webRequest.onHeadersReceived((details: unknown, callback: (r: unknown) => void) => {
        try {
          const d = details as { statusCode?: number; url: string; responseHeaders?: Record<string, string[]> };
          const status = d.statusCode ?? 0;
          const headers = d.responseHeaders ?? {};
          if (status >= 300 && status < 400) {
            const loc = headers['location'] ?? headers['Location'];
            const target = Array.isArray(loc) ? loc[0] : loc;
            if (target) {
              let resolved = target;
              try { resolved = new URL(target, d.url).toString(); } catch { /* keep */ }
              if (this.interceptor.isAdUrl(resolved)) {
                callback({ cancel: true });
                return;
              }
            }
          }
        } catch { /* fail open */ }
        callback({});
      });
    }
    if (typeof webRequest.onBeforeRedirect === 'function') {
      webRequest.onBeforeRedirect((details) => {
        const d = details as { id?: number; redirectURL?: string };
        if (d.id !== undefined && d.redirectURL) tracker.redirect(d.id, d.redirectURL);
      });
    }
    if (typeof webRequest.onCompleted === 'function') {
      webRequest.onCompleted((details) => {
        if (details.id !== undefined) tracker.complete(details.id);
      });
    }
    if (typeof webRequest.onErrorOccurred === 'function') {
      webRequest.onErrorOccurred((details) => {
        if (details.id !== undefined) tracker.complete(details.id);
      });
    }
  }
}
