/**
 * Passive, privacy-scrubbed traffic capture for Shadow Replay.
 *
 * Never changes blocking behavior. Records interceptor decisions as JSONL
 * in a bounded ring buffer. Default off.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getConfigDir } from './config.js';

export interface ShadowDecision {
  blocked: boolean;
  surface?: string;
  stage?: string;
  endpoint?: string;
}

export interface ShadowEntry {
  v: 1;
  at: number;
  method: string;
  path: string;
  originHash: string;
  session: string;
  decision: ShadowDecision;
  ms: number;
}

export interface ShadowConfig {
  enabled: boolean;
  dryRun: boolean;
  captureDir: string;
  maxFileBytes: number;
  maxFiles: number;
  sampleRate: number;
  scrubQuery: boolean;
  captureControls: boolean;
}

const DEFAULTS: ShadowConfig = {
  enabled: false,
  dryRun: false,
  captureDir: '',
  maxFileBytes: 8 * 1024 * 1024,
  maxFiles: 5,
  sampleRate: 1.0,
  scrubQuery: true,
  captureControls: true,
};

export class ShadowCapture {
  private config: ShadowConfig;
  private dir: string;

  constructor(config?: Partial<ShadowConfig>) {
    this.config = { ...DEFAULTS, ...config };
    this.dir = this.config.captureDir || path.join(getConfigDir(), 'captures');
  }

  isEnabled(): boolean { return this.config.enabled; }
  isDryRun(): boolean { return this.config.dryRun; }

  /** Returns true if this request should be captured (sampling). */
  shouldCapture(): boolean {
    if (!this.config.enabled) return false;
    if (this.config.sampleRate >= 1) return true;
    return Math.random() < this.config.sampleRate;
  }

  record(entry: Omit<ShadowEntry, 'v'>): void {
    if (!this.config.enabled) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const file = this.currentFile();
      const line = JSON.stringify({ v: 1, ...entry }) + '\n';
      const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
      if (size + Buffer.byteLength(line) > this.config.maxFileBytes) {
        this.rotate();
      }
      fs.appendFileSync(this.currentFile(), line);
      this.enforceCap();
    } catch {
      /* best-effort; never throw */
    }
  }

  private currentFile(): string {
    return path.join(this.dir, 'capture.jsonl');
  }

  private rotate(): void {
    const base = this.currentFile();
    for (let i = this.config.maxFiles - 1; i >= 1; i--) {
      const src = i === 1 ? base : `${base}.${String(i - 1)}`;
      const dst = `${base}.${String(i)}`;
      if (fs.existsSync(src)) {
        try { fs.renameSync(src, dst); } catch { /* ignore */ }
      }
    }
    // remove oldest
    const oldest = `${base}.${String(this.config.maxFiles)}`;
    try { fs.rmSync(oldest, { force: true }); } catch { /* ignore */ }
  }

  private enforceCap(): void {
    // remove extra rotated files beyond maxFiles
    for (let i = this.config.maxFiles + 1; i <= this.config.maxFiles + 5; i++) {
      const f = `${this.currentFile()}.${String(i)}`;
      try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
    }
  }

  static hashOrigin(origin: string): string {
    return 'sha256:' + crypto.createHash('sha256').update(origin).digest('hex').slice(0, 16);
  }

  static scrubPath(url: string, scrubQuery: boolean): { path: string; origin: string } {
    try {
      const u = new URL(url);
      const p = scrubQuery ? u.pathname : u.pathname + u.search;
      return { path: p, origin: `${u.protocol}//${u.host}` };
    } catch {
      return { path: url, origin: '' };
    }
  }

  updateConfig(patch: Partial<ShadowConfig>): void {
    this.config = { ...this.config, ...patch };
    if (patch.captureDir) this.dir = patch.captureDir;
  }
}
