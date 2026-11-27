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
    // Remember the binding even while disabled: the config watcher can enable
    // Ghost Mode later without passing IPC again.
    if (ipc) this.ipc = ipc;
    if (!this.config.enabled) return;
    if (this.active) return;
    if (this.ipc) {
      const rules = rulesForPreset(this.config.preset);
      const sigs = rules.filter((r) => r.context === 'postMessage').map((r) => r.match.signature);
      const fields = rules.flatMap((r) => r.fields ?? []);
      this.ipcHandle = wrapIpcMain(this.ipc, sigs, fields);
    }
    this.active = true;
  }

  deactivate(): void {
    if (this.ipcHandle) { this.ipcHandle.uninstall(); this.ipcHandle = null; }
    this.active = false;
  }

  updateConfig(config: GhostRuntimeConfig): void {
    const ipc = this.ipc;
    this.deactivate();
    this.config = { ...config };
    // Re-arm whenever enabled, including after a disable→enable toggle. The
    // guard is idempotent and deactivate() already uninstalled the old wrap.
    if (this.config.enabled) this.activate(ipc ?? undefined);
  }

  report(): { enabled: boolean; preset: string; active: boolean } {
    return { enabled: this.config.enabled, preset: this.config.preset, active: this.active };
  }
}
