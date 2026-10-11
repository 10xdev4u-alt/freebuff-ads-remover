import type { CssInjectionTarget } from './css-injector.js';
import type { ElectronAppLike } from './electron-bridge.js';
import type { Logger } from './logger.js';

interface WebContentsLike {
  getType(): string;
  getURL(): string;
  isDestroyed(): boolean;
  insertCSS(css: string): Promise<string>;
  removeInsertedCSS(key: string): Promise<void>;
  on(event: string, listener: () => void): unknown;
}

interface WcState {
  generation: number;
  keys: Map<string, string>;
}

// Only the app's own UI (the locally served orchestrator) — never injected
// into previewed third-party sites, whose class names could collide with
// our ad-surface selectors.
const APP_URL_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?([/?#]|$)/;

/**
 * CssInjectionTarget backed by webContents.insertCSS — `session` has no
 * insertCSS API. Rules are re-injected on every main-frame load because
 * inserted CSS does not survive navigation.
 */
export class WebContentsCssTarget implements CssInjectionTarget {
  private readonly rules = new Map<string, string>();
  private readonly states = new WeakMap<WebContentsLike, WcState>();
  private readonly watched = new Set<WebContentsLike>();
  private readonly onCreated: (...args: unknown[]) => void;
  private nextId = 0;
  private disposed = false;

  constructor(
    private readonly app: ElectronAppLike,
    private readonly getAllWebContents: (() => unknown[]) | null,
    private readonly logger: Logger,
  ) {
    this.onCreated = (_event: unknown, contents: unknown): void => {
      this.watch(contents);
    };
    this.app.on('web-contents-created', this.onCreated);
    this.adoptAll();
  }

  insertCSS(css: string): Promise<string> {
    this.nextId += 1;
    const id = `far-css-${String(this.nextId)}`;
    this.rules.set(id, css);
    for (const contents of this.currentContents()) {
      this.injectInto(contents, id, css);
    }
    return Promise.resolve(id);
  }

  async removeCSS(id: string): Promise<void> {
    this.rules.delete(id);
    for (const contents of this.currentContents()) {
      const state = this.states.get(contents);
      const key = state?.keys.get(id);
      if (!state || !key) continue;
      state.keys.delete(id);
      try {
        await contents.removeInsertedCSS(key);
      } catch (err) {
        this.logger.debug('removeInsertedCSS failed', err);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.app.removeListener('web-contents-created', this.onCreated);
    } catch (err) {
      this.logger.debug('removeListener failed', err);
    }
    this.watched.clear();
    this.rules.clear();
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  private adoptAll(): void {
    if (!this.getAllWebContents) return;
    for (const raw of this.getAllWebContents()) {
      this.watch(raw);
    }
  }

  private currentContents(): WebContentsLike[] {
    this.adoptAll();
    return [...this.watched].filter((contents) => !contents.isDestroyed());
  }

  private watch(raw: unknown): void {
    if (this.disposed) return;
    if (typeof raw !== 'object' || raw === null) return;
    const contents = raw as WebContentsLike;
    if (this.watched.has(contents)) return;
    this.watched.add(contents);
    this.states.set(contents, { generation: 0, keys: new Map() });

    contents.on('destroyed', () => {
      this.watched.delete(contents);
      this.states.delete(contents);
    });
    contents.on('did-finish-load', () => {
      if (this.disposed || contents.isDestroyed()) return;
      const state = this.states.get(contents);
      if (!state) return;
      state.generation += 1;
      state.keys.clear();
      for (const [id, css] of this.rules) {
        this.injectInto(contents, id, css);
      }
    });
  }

  private injectInto(contents: WebContentsLike, id: string, css: string): void {
    if (this.disposed || contents.isDestroyed()) return;
    if (contents.getType() === 'devtools') return;
    if (!APP_URL_PATTERN.test(contents.getURL())) return;
    const state = this.states.get(contents);
    if (!state) return;
    const generation = state.generation;
    void contents
      .insertCSS(css)
      .then((key) => {
        if (this.disposed) return;
        const current = this.states.get(contents);
        if (!current || current.generation !== generation) return;
        current.keys.set(id, key);
      })
      .catch((err: unknown) => {
        this.logger.debug('insertCSS failed', err);
      });
  }
}
