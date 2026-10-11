export type WebRequestListener = (
  details: { url: string; method: string },
  callback: (response: { cancel?: boolean }) => void,
) => void;

export interface ElectronWebRequestLike {
  onBeforeRequest(filter: { urls: string[] } | null, listener: WebRequestListener | null): void;
}

export interface ElectronSessionModuleLike {
  defaultSession?: { webRequest?: ElectronWebRequestLike };
}

export interface ElectronAppLike {
  whenReady(): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
}

export interface ElectronWebContentsModuleLike {
  getAllWebContents(): unknown[];
}

export interface ElectronBridge {
  app: ElectronAppLike;
  session: ElectronSessionModuleLike;
  webContents?: ElectronWebContentsModuleLike | null;
}

function narrow(value: unknown): ElectronBridge | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { app?: unknown; session?: unknown; webContents?: unknown };
  if (!candidate.app || !candidate.session) return null;
  const app = candidate.app as { whenReady?: unknown; on?: unknown; removeListener?: unknown };
  if (typeof app.whenReady !== 'function' || typeof app.on !== 'function') return null;
  return {
    app: candidate.app as ElectronAppLike,
    session: candidate.session,
    webContents: (candidate.webContents as ElectronWebContentsModuleLike | undefined) ?? null,
  };
}

export function getElectron(): ElectronBridge | null {
  try {
    // Main process only. In a renderer this resolves to a path string, and
    // under ELECTRON_RUN_AS_NODE it throws — both fall through below.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic load; `electron` is a runtime builtin, not a bundlable import
    const electron = require('electron') as unknown;
    const bridge = narrow(electron);
    if (bridge) return bridge;
  } catch {
    // not running as an Electron main process
  }

  try {
    const p = process as unknown as { _linkedBinding?: (name: string) => unknown };
    const binding = p._linkedBinding;
    if (typeof binding === 'function') {
      const bridge = narrow({
        app: binding('electron_browser_app'),
        session: binding('electron_browser_session'),
      });
      if (bridge) return bridge;
    }
  } catch {
    // linked binding unavailable in this process
  }

  return null;
}
