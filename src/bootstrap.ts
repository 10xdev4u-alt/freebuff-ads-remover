import path from 'node:path';
import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { loadConfig, watchConfig, getConfigDir } from './config.js';
import { Logger } from './logger.js';
import { AdInterceptor } from './interceptor.js';
import { CssInjector } from './css-injector.js';
import { Dashboard, loadPackageVersion } from './dashboard.js';
import { StatsStore } from './stats-store.js';
import { ElectronHook } from './electron-hook.js';
import { RuntimeVerifier } from './runtime-verifier.js';
import { startVerifyService } from './verify-service.js';
import type { VerifyServiceHandle } from './verify-service.js';
import type { ElectronApi } from './electron-hook.js';
import type { StatsSnapshot } from './types.js';
import { getElectron } from './electron-bridge.js';
import { createCrashGuard } from './crash-guard.js';
import { ShadowCapture } from './shadow-capture.js';
import { BlockLog } from './block-log.js';
import { MissLog } from './miss-log.js';
import { OutcomeLog } from './outcome-log.js';
import { RuleRegistry } from './rule-registry.js';
import { PromotionEngine } from './promotion.js';
import { loadGeneratedRules } from './generated-rules.js';
import { GhostRuntime } from './ghost/runtime.js';

export { AD_SURFACES, AD_ENDPOINTS, AD_STAGES, PLACEMENT_IDS, DEFAULT_CONFIG, PIPELINE_STAGES, STAGE_LABELS, stageForEndpoint } from './types.js';
export type { AdSurface, AdEndpoint, AdStage, ExtensionConfig, InterceptResult, AdPattern, BlockEvent, StatsSnapshot, FarBuffShieldApi } from './types.js';
export { loadConfig, saveConfig, getConfigPath, getConfigDir, watchConfig, PRESETS } from './config.js';
export type { Preset } from './config.js';
export type { Config } from './config.js';
export { Logger } from './logger.js';
export { AdInterceptor } from './interceptor.js';
export { CssInjector } from './css-injector.js';
export type { CssInjectionTarget } from './css-injector.js';
export { Dashboard, HIDE_SELECTORS, loadClientSource, loadPackageVersion } from './dashboard.js';
export { StatsStore } from './stats-store.js';
export { ElectronHook } from './electron-hook.js';
export type { ElectronApi } from './electron-hook.js';
export { WebContentsCssTarget } from './web-contents-css.js';
export { WebContentsScriptTarget } from './web-contents-script.js';
export { buildDomRemoverScript, buildDomRemoverFromSelectors } from './dom-remover.js';
export { buildDomProbeScript } from './dom-probe.js';
export { createCrashGuard } from './crash-guard.js';
export { RuleRegistry, baseRuleSet } from './rule-registry.js';
export { synthesizeDelta } from './rule-synthesis.js';
export { verifyDelta } from './delta-gate.js';
export { PromotionEngine } from './promotion.js';
export { buildTrustReport } from './trust-report.js';
export { rulesForPreset, loadRules } from './ghost/rules.js';
export { installScrubber, isAdContext, scrubPayload } from './ghost/identifier-scrubber.js';
export { neutralizeMarkers, DEFAULT_MARKERS } from './ghost/dom-marker-neutralizer.js';
export { eraseContext } from './ghost/context-eraser.js';
export { verifyStealth } from './ghost/stealth-verifier.js';
export { runCli } from './cli.js';
export { runGate } from './gate.js';
export { loadCorpus, verifyCorpus } from './corpus.js';
export { RuntimeVerifier } from './runtime-verifier.js';
export type { VerificationReport, ProbeResult, RuntimeVerifierConfig } from './runtime-verifier.js';

let logger: Logger | null = null;
let interceptor: AdInterceptor | null = null;
let cssInjector: CssInjector | null = null;
let statsStore: StatsStore | null = null;
let dashboard: Dashboard | null = null;
let electronHook: ElectronHook | null = null;
let unwatchConfig: (() => void) | null = null;
let runtimeVerifier: RuntimeVerifier | null = null;
let ghostRuntime: GhostRuntime | null = null;
let verifyService: VerifyServiceHandle | null = null;
let verifyTimer: ReturnType<typeof setTimeout> | null = null;
const crashGuard = createCrashGuard();

// Machine-readable proof that activate() reached its success path. The load
// marker in app.asar only shows the loader was present; the launcher's
// pre-exec check cannot see a boot it has not started yet. This receipt is
// written by bootstrap itself and consumed by scripts/check-runtime-load.mjs
// (and by the headless E2E). It is a diagnostic claim, never an ad-blocking
// gate: PID reuse and clock skew mean freshness + liveness reduce false
// positives rather than eliminate them.
function loadReceiptPath(): string {
  return path.join(getConfigDir(), 'load-receipt.json');
}

function clearLoadReceipt(): void {
  try {
    rmSync(loadReceiptPath(), { force: true });
  } catch { /* diagnostic file only */ }
}

function writeLoadReceipt(): void {
  try {
    const dir = getConfigDir();
    mkdirSync(dir, { recursive: true });
    const target = loadReceiptPath();
    const tmp = `${target}.tmp-${String(process.pid)}`;
    writeFileSync(tmp, JSON.stringify({ status: 'loaded', at: new Date().toISOString(), pid: process.pid, version: loadPackageVersion() }), 'utf8');
    renameSync(tmp, target);
  } catch { /* never fail activation over a receipt */ }
}


export function activate(session?: unknown, electronApi?: ElectronApi): boolean {
  try {
    // A refused or failed activation must not leave a receipt that claims the
    // previous launch succeeded.
    clearLoadReceipt();
    if (!crashGuard.shouldActivate()) {
      console.warn('[freebuff-ads-remover] Crash loop detected; extension disabled. Reset crash count to retry.');
      return false;
    }
    crashGuard.markRunning();
    const config = loadConfig();
    logger = new Logger(config.logLevel, config.logToFile);
    logger.info('Freebuff Ads Remover activating...');
    statsStore = new StatsStore();
    const shadowCapture = new ShadowCapture(config.shadow);
    const blockLog = new BlockLog(getConfigDir() + '/block-log.jsonl');
    const missLog = new MissLog(getConfigDir() + '/miss-log.jsonl');
    const outcomeLog = new OutcomeLog(getConfigDir() + '/outcomes.jsonl');
    const registry = RuleRegistry.load(getConfigDir()) ?? new RuleRegistry();
    const promotionEngine = new PromotionEngine({ promoteAfter: config.shield.promoteAfter, enabled: config.shield.autoHeal, registry, statePath: getConfigDir() + '/shield-state.json', maxPromotedRules: config.shield.maxPromotedRules, rollbackOnFailure: config.shield.rollbackOnFailure, corpusDir: path.join(__dirname, '..', 'corpus'), configDir: getConfigDir() });
    promotionEngine.beginLaunch();
    // Shipped (CI-healed) artifact: <pkgroot>/config/generated-rules.json
    try {
      const shippedPath = path.join(__dirname, '..', 'config', 'generated-rules.json');
      const shipped = loadGeneratedRules(shippedPath);
      if (shipped) registry.apply(shipped);
    } catch { /* fail open */ }
    // User override (runtime-promoted): config/generated-rules.json
    try {
      const userGen = loadGeneratedRules(getConfigDir() + '/generated-rules.json');
      if (userGen) registry.apply(userGen);
    } catch { /* fail open */ }
    // Feed-synced heals (launcher-fetched, signed): config/feed-rules.json
    try {
      const feedGen = loadGeneratedRules(getConfigDir() + '/feed-rules.json');
      if (feedGen) registry.apply(feedGen);
    } catch { /* fail open */ }
    // Promotion engine (opt-in via shield.autoHeal).
    interceptor = new AdInterceptor(config, logger, statsStore, shadowCapture, registry, blockLog, missLog, (route) => { promotionEngine.observe('route:' + route); void promotionEngine.tick(); }, outcomeLog);
    promotionEngine.setInterceptor(interceptor);
    cssInjector = new CssInjector(config, logger, registry);
    dashboard = new Dashboard(statsStore, logger, { enabled: config.dashboard });
    electronHook = new ElectronHook(interceptor, cssInjector, logger, dashboard, config.domRemoval, config);
    if (session) {
      electronHook.activate(session, electronApi);
    }
    // Clear the crash sentinel on a graceful quit. Without this the sentinel
    // survives every ordinary exit and the guard eventually disables the
    // extension after a few launches (fail-open for the host, but the user
    // loses ad blocking). Tests and non-Electron hosts pass no app object.
    if (electronApi?.app.on) {
      try {
        electronApi.app.on('will-quit', () => { deactivate(); });
      } catch (err) {
        logger.warn('will-quit hook failed', err);
      }
    }
    // Ghost Mode runtime (default off).
    ghostRuntime = new GhostRuntime(config.ghost);
    ghostRuntime.activate();
    // Verification subsystem (fail-open).
    try {
      runtimeVerifier = new RuntimeVerifier(logger, {
        timeoutMs: config.verify.timeoutMs,
        probeRoutes: config.verify.probeRoutes,
        controlRoutes: config.verify.controlRoutes,
        concurrency: config.verify.concurrency,
        orchestratorOrigin: config.verify.orchestratorOrigin,
      });
      promotionEngine.setRuntimeVerifier(runtimeVerifier);
      const attachAll = (): void => {
        try {
          const ec = getElectron();
          const all = ec?.webContents?.getAllWebContents() ?? [];
          runtimeVerifier?.watch(ec?.app, () => (ec?.webContents?.getAllWebContents() ?? []) as unknown as Parameters<RuntimeVerifier['attachAll']>[0]);
          runtimeVerifier?.attachAll(all as unknown as Parameters<RuntimeVerifier['attachAll']>[0]);
        } catch (e) {
          logger?.warn('Verifier attach failed', e);
        }
      };
      attachAll();
      if (config.verify.enabled) {
        void startVerifyService(
          { enabled: true, port: config.verify.port, tokenPath: (getConfigDir() + '/verify.json') },
          runtimeVerifier,
          logger,
          loadPackageVersion(),
          blockLog,
          // eslint-disable-next-line @typescript-eslint/use-unknown-in-catch-callback-variable
        ).then((h) => { verifyService = h; }).catch((e) => logger?.warn('Verify service failed', e));
      }
      if (config.verify.runOnBoot) {
        verifyTimer = setTimeout(() => {
          if (!runtimeVerifier) return;
          void runtimeVerifier.run().then((report) => {
            if (report.reason === 'control-not-reached') {
              const rolled = registry.rollbackFromDisk(getConfigDir());
              if (rolled) logger?.warn('shield: rolled back promoted rules due to control-not-reached');
            }
          }).catch((e: unknown) => logger?.warn('Verify run failed', e));
        }, config.verify.settleMs);
      }
    } catch (e) {
      logger.warn('Verification subsystem failed to start', e);
    }
    unwatchConfig = watchConfig((newConfig) => {
      logger?.info('Config changed, reloading...');
      interceptor?.updateConfig(newConfig);
      cssInjector?.updateConfig(newConfig);
      electronHook?.updateConfig(newConfig);
      dashboard?.setEnabled(newConfig.dashboard);
      runtimeVerifier?.updateConfig({
        timeoutMs: newConfig.verify.timeoutMs,
        probeRoutes: newConfig.verify.probeRoutes,
        controlRoutes: newConfig.verify.controlRoutes,
        concurrency: newConfig.verify.concurrency,
        orchestratorOrigin: newConfig.verify.orchestratorOrigin,
      });
      logger?.setLevel(newConfig.logLevel);
      logger?.setLogToFile(newConfig.logToFile);
    });
    logger.info('Freebuff Ads Remover activated successfully');
    writeLoadReceipt();
    return true;
  } catch (err) {
    console.error('[freebuff-ads-remover] Activation failed:', err);
    return false;
  }
}

export function deactivate(): void {
  try {
    clearLoadReceipt();
    crashGuard.markCleanExit();
    if (verifyTimer) clearTimeout(verifyTimer);
    verifyService?.close().catch(() => {});
    runtimeVerifier?.detachAll();
    electronHook?.deactivate();
    unwatchConfig?.();
    logger?.info('Freebuff Ads Remover deactivated');
  } catch (err) {
    console.error('[freebuff-ads-remover] Deactivation failed:', err);
  } finally {
    electronHook = null;
    runtimeVerifier = null;
    verifyService = null;
    verifyTimer = null;
    interceptor = null;
    cssInjector = null;
    statsStore = null;
    dashboard = null;
    unwatchConfig = null;
  }
}

export function getStats(): { requestCount: number; blockCount: number; patterns: number } | null {
  return interceptor?.getStats() ?? null;
}

export function getShieldSnapshot(): StatsSnapshot | null {
  return statsStore?.snapshot() ?? null;
}

export function getGhostReport() { return ghostRuntime ? ghostRuntime.report() : null; }

export function isElectronAvailable(): boolean {
  try {
    return typeof process !== 'undefined' && !!process.versions.electron;
  } catch {
    return false;
  }
}

if (isElectronAvailable()) {
  const electron = getElectron();
  if (electron) {
    void electron.app
      .whenReady()
      .then(() => {
        activate(electron.session, electron);
      })
      .catch((err: unknown) => {
        console.error('[freebuff-ads-remover] app.whenReady failed:', err);
      });
  }
}
