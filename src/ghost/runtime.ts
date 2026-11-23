import { wrapIpcMain } from './ipc-guard.js';
import { rulesForPreset } from './rules.js';

export interface GhostRuntimeConfig { enabled: boolean; preset: 'standard' | 'aggressive' | 'paranoid' }

type GhostIpc = {
  on: (c: string, l: (...a: unknown[]) => void) => void;
  handle: (c: string, h: (...a: unknown[]) => unknown) => void;
};

export class GhostRuntime {
  private config: GhostRuntimeConfig;
  private ipc: GhostIpc | null = null;
  private ipcHandle: { uninstall: () => void } | null = null;
  private active = false;

  constructor(config: GhostRuntimeConfig) {
    this.config = { ...config };
  }

  activate(ipc?: GhostIpc): void {
    if (!this.config.enabled) return;
    if (this.active) return;
    if (ipc) {
      this.ipc = ipc;
      const rules = rulesForPreset(this.config.preset);
      const sigs = rules.filter((r) => r.context === 'postMessage').map((r) => r.match.signature);
      const fields = rules.flatMap((r) => r.fields ?? []);
      this.ipcHandle = wrapIpcMain(ipc, sigs, fields);
    }
    this.active = true;
  }

  deactivate(): void {
    if (this.ipcHandle) { this.ipcHandle.uninstall(); this.ipcHandle = null; }
    this.active = false;
  }

  updateConfig(config: GhostRuntimeConfig): void {
    const wasActive = this.active;
    const ipc = this.ipc;
    this.deactivate();
    this.config = { ...config };
    // Re-arm against the same IPC binding; dropping it would leave the runtime
    // active but silently unguarded after a preset change.
    if (wasActive && this.config.enabled) this.activate(ipc ?? undefined);
  }

  report(): { enabled: boolean; preset: string; active: boolean } {
    return { enabled: this.config.enabled, preset: this.config.preset, active: this.active };
  }
}
