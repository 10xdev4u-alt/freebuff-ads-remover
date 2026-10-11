import type { ElectronAppLike } from './electron-bridge.js';
import type { Logger } from './logger.js';
import { APP_URL_PATTERN } from './web-contents-css.js';

interface ScriptWebContentsLike {
  getType(): string;
  getURL(): string;
  isDestroyed(): boolean;
  executeJavaScript(code: string): Promise<unknown>;
  on(event: string, listener: () => void): unknown;
}

/**
 * Fires scripts into app-origin webContents via executeJavaScript (which
 * bypasses page CSP). Stored rules re-run on every main-frame load because
 * page JS state does not survive navigation; posts are one-shot.
 */
export class WebContentsScriptTarget {
  private readonly rules = new Map<string, string>();
  private readonly watched = new Set<ScriptWebContentsLike>();
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

  injectScript(code: string): string {
    this.nextId += 1;
    const id = `far-script-${String(this.nextId)}`;
    this.rules.set(id, code);
    for (const contents of this.currentContents()) {
      this.execute(contents, code);
    }
    return id;
  }

  postScript(code: string): void {
    if (this.disposed) return;
    for (const contents of this.currentContents()) {
      this.execute(contents, code);
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

  private currentContents(): ScriptWebContentsLike[] {
    this.adoptAll();
    return [...this.watched].filter((contents) => !contents.isDestroyed());
  }

  private watch(raw: unknown): void {
    if (this.disposed) return;
    if (typeof raw !== 'object' || raw === null) return;
    const contents = raw as ScriptWebContentsLike;
    if (this.watched.has(contents)) return;
    this.watched.add(contents);

    contents.on('destroyed', () => {
      this.watched.delete(contents);
    });
    contents.on('did-finish-load', () => {
      if (this.disposed || contents.isDestroyed()) return;
      for (const code of this.rules.values()) {
        this.execute(contents, code);
      }
    });
  }

  private execute(contents: ScriptWebContentsLike, code: string): void {
    if (this.disposed || contents.isDestroyed()) return;
    if (contents.getType() === 'devtools') return;
    if (!APP_URL_PATTERN.test(contents.getURL())) return;
    void contents
      .executeJavaScript(code)
      .catch((err: unknown) => {
        this.logger.debug('executeJavaScript failed', err);
      });
  }
}
