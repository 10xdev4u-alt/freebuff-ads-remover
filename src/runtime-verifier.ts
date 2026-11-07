/**
 * Runtime verification of ad blocking.
 *
 * The extension's own counters (AdInterceptor.getStats()) are not proof: they
 * only say we *tried* to block. This module observes the renderer's own network
 * stack through `webContents.debugger` (the main-process CDP API that the
 * upstream `--remote-debugging-port` fuse cannot disable) and confirms that
 * ad routes actually fail with `net::ERR_BLOCKED_BY_CLIENT` while control
 * routes actually reach the orchestrator.
 *
 * Fail-open: if attach/evaluate throws, the report records `pass:false` with a
 * reason; the host app is never crashed.
 */

import type { Logger } from './logger.js';
import { isInjectionTarget } from './web-contents-css.js';

export interface ProbeResult {
  route: string;
  kind: 'ad' | 'control';
  outcome: 'blocked' | 'reached' | 'failed-other' | 'timeout';
  detail?: string;
}

export interface VerificationReport {
  pass: boolean;
  reason?: string;
  targets: number;
  probes: ProbeResult[];
  at: number;
}

export interface RuntimeVerifierConfig {
  timeoutMs: number;
  probeRoutes: string[];
  controlRoutes: string[];
  concurrency: number;
  orchestratorOrigin: string;
}

export interface DebuggerLike {
  attach(protocolVersion: string): void;
  detach(): void;
  sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WebContentsLike {
  getType?(): string;
  getURL?(): string;
  isDestroyed?(): boolean;
  debugger?: DebuggerLike;
}

export interface AppLike {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

const DEFAULT_CONFIG: RuntimeVerifierConfig = {
  timeoutMs: 30_000,
  probeRoutes: ['/api/ad/policy', '/api/ad/break', '/api/ad/billboard', '/api/ad/impression', '/api/telemetry/ad-density'],
  controlRoutes: ['/healthz', '/api/account/usage'],
  concurrency: 8,
  orchestratorOrigin: 'http://127.0.0.1:5174',
};

export class RuntimeVerifier {
  private logger: Logger;
  private config: RuntimeVerifierConfig;
  private attached: Set<WebContentsLike>;
  private lastReport: VerificationReport | null;

  constructor(logger: Logger, config?: Partial<RuntimeVerifierConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.attached = new Set();
    this.lastReport = null;
  }

  /** Attach to eligible webContents. Safe: never throws. */
  attachAll(contentsList: WebContentsLike[]): void {
    for (const wc of contentsList) {
      this.attachOne(wc);
    }
  }

  attachOne(wc: WebContentsLike): boolean {
    if (wc.isDestroyed?.()) return false;
    if (wc.getType?.() !== 'window') return false;
    const url = wc.getURL?.() ?? '';
    if (!isInjectionTarget(url)) return false;
    const dbg = wc.debugger;
    if (!dbg) return false;
    try {
      dbg.attach('1.3');
      void dbg.sendCommand('Network.enable');
      void dbg.sendCommand('Runtime.enable');
      this.attached.add(wc);
      this.logger.debug('RuntimeVerifier attached', { url });
      return true;
    } catch (err) {
      this.logger.warn('RuntimeVerifier attach failed', err);
      return false;
    }
  }

  detachAll(): void {
    for (const wc of this.attached) {
      try {
        wc.debugger?.detach();
      } catch (err) {
        this.logger.debug('RuntimeVerifier detach failed', err);
      }
    }
    this.attached.clear();
  }

  getAttachedCount(): number {
    return this.attached.size;
  }

  getLastReport(): VerificationReport | null {
    return this.lastReport;
  }

  /**
   * Run a full verification pass against the (already-attached) webContents.
   * Returns a report; never throws.
   */
  async run(): Promise<VerificationReport> {
    const allRoutes = [
      ...this.config.probeRoutes.map((r) => ({ route: r, kind: 'ad' as const })),
      ...this.config.controlRoutes.map((r) => ({ route: r, kind: 'control' as const })),
    ];

    if (this.attached.size === 0) {
      const report: VerificationReport = {
        pass: false,
        reason: 'no-attached-targets',
        targets: 0,
        probes: [],
        at: Date.now(),
      };
      this.lastReport = report;
      return report;
    }

    if (this.attached.size === 0) {
      const report: VerificationReport = {
        pass: false,
        reason: 'no-attached-targets',
        targets: 0,
        probes: [],
        at: Date.now(),
      };
      this.lastReport = report;
      return report;
    }

    const allProbes: ProbeResult[] = [];
    const targetResults: { url: string; pass: boolean }[] = [];
    for (const wc of this.attached) {
      const dbg = wc.debugger;
      if (!dbg) {
        targetResults.push({ url: wc.getURL?.() ?? '', pass: false });
        continue;
      }
      const results = await this.runProbes(dbg, allRoutes);
      allProbes.push(...results);
      const adP = results.filter((p) => p.kind === 'ad');
      const ctrlP = results.filter((p) => p.kind === 'control');
      const tPass = adP.length > 0 && ctrlP.length > 0 && adP.every((p) => p.outcome === 'blocked') && ctrlP.every((p) => p.outcome === 'reached');
      targetResults.push({ url: wc.getURL?.() ?? '', pass: tPass });
    }

    const adProbes = allProbes.filter((p) => p.kind === 'ad');
    const controlProbes = allProbes.filter((p) => p.kind === 'control');
    const adBlocked = adProbes.length > 0 && adProbes.every((p) => p.outcome === 'blocked');
    const controlReached = controlProbes.length > 0 && controlProbes.every((p) => p.outcome === 'reached');
    const pass = adBlocked && controlReached && targetResults.every((t) => t.pass);

    const report: VerificationReport = {
      pass,
      ...(pass ? {} : { reason: this.failureReason(adProbes, controlProbes) }),
      targets: this.attached.size,
      probes: allProbes,
      at: Date.now(),
    };
    this.lastReport = report;
    this.logger.info('Runtime verification complete', { pass, targets: report.targets, probes: allProbes.length });
    return report;
  }

  private failureReason(adProbes: ProbeResult[], controlProbes: ProbeResult[]): string {
    if (adProbes.some((p) => p.outcome !== 'blocked')) return 'ad-not-blocked';
    if (controlProbes.some((p) => p.outcome !== 'reached')) return 'control-not-reached';
    if (adProbes.length === 0) return 'no-ad-probes';
    if (controlProbes.length === 0) return 'no-control-probes';
    return 'unknown';
  }

  private async runProbes(
    dbg: DebuggerLike,
    routes: { route: string; kind: 'ad' | 'control' }[],
  ): Promise<ProbeResult[]> {
    const results: ProbeResult[] = [];
    const concurrency = Math.max(1, this.config.concurrency);
    let i = 0;
    const worker = async (): Promise<void> => {
      while (i < routes.length) {
        const idx = i++;
        const entry = routes[idx];
        if (!entry) return;
        const { route, kind } = entry;
        results[idx] = await this.probeOne(dbg, route, kind);
      }
    };
    const workers = Array.from({ length: Math.min(concurrency, routes.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  private probeOne(dbg: DebuggerLike, route: string, kind: 'ad' | 'control'): Promise<ProbeResult> {
    return new Promise<ProbeResult>((resolve) => {
      const id = `__far_verify_${Math.random().toString(36).slice(2)}`;
      const origin = this.config.orchestratorOrigin.replace(/\/$/, '');
      const url = `${origin}${route}${route.includes('?') ? '&' : '?'}${id}`;
      const requestIds = new Map<string, string>();
      const onEvent = (method: unknown, params: unknown): void => {
        const m = method as string;
        const p = params as Record<string, unknown>;
        if (m === 'Network.requestWillBeSent') {
          const req = p.request as { url?: string } | undefined;
          if (typeof req?.url === 'string' && req.url.includes(id)) {
            requestIds.set(p.requestId as string, req.url);
          }
        } else if (m === 'Network.loadingFailed') {
          const rid = p.requestId as string;
          if (requestIds.has(rid)) {
            const errorText = typeof p.errorText === 'string' ? p.errorText : '';
            if (errorText.includes('ERR_BLOCKED_BY_CLIENT')) {
              cleanup();
              resolve({ route, kind, outcome: 'blocked' });
            } else {
              cleanup();
              resolve({ route, kind, outcome: 'failed-other', detail: errorText });
            }
          }
        } else if (m === 'Network.responseReceived') {
          const rid = p.requestId as string;
          if (requestIds.has(rid)) {
            cleanup();
            resolve({ route, kind, outcome: 'reached' });
          }
        }
      };

      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (): void => {
        if (timer) clearTimeout(timer);
        try {
          dbg.off('message', handler as (...args: unknown[]) => void);
        } catch {
          /* ignore */
        }
      };

      const handler = (_event: unknown, method: string, params: unknown): void => { onEvent(method, params); };

      dbg.on('message', handler as (...args: unknown[]) => void);

      // Trigger the fetch in the renderer.
      const evalExpr = `fetch(${JSON.stringify(url)}, { credentials: 'include', cache: 'no-store' }).catch(function(){})`;
      void dbg.sendCommand('Runtime.evaluate', { expression: evalExpr, awaitPromise: false });

      timer = setTimeout(() => {
        cleanup();
        resolve({ route, kind, outcome: 'timeout' });
      }, this.config.timeoutMs);
    });
  }

  updateConfig(patch: Partial<RuntimeVerifierConfig>): void {
    this.config = { ...this.config, ...patch };
  }
}
