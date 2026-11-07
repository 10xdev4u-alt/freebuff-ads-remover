import { wrapIpcMain } from './ipc-guard.js';
import { rulesForPreset } from './rules.js';

export interface GhostRuntimeConfig { enabled: boolean; preset: 'standard' | 'aggressive' | 'paranoid' }

export class GhostRuntime {
  private config: GhostRuntimeConfig;
  private ipcHandle: { uninstall: () => void } | null = null;
  private active = false;

  constructor(config: GhostRuntimeConfig) {
    this.config = { ...config };
  }

  activate(ipc?: { on: (c: string, l: (...a: unknown[]) => void) => void; handle: (c: string, h: (...a: unknown[]) => unknown) => void }): void {
    if (!this.config.enabled) return;
    if (this.active) return;
    if (ipc) {
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
    this.deactivate();
    this.config = { ...config };
    if (wasActive && this.config.enabled) this.activate();
  }

  report(): { enabled: boolean; preset: string; active: boolean } {
    return { enabled: this.config.enabled, preset: this.config.preset, active: this.active };
  }
}
