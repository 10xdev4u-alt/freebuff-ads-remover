import type { InterceptResult, AdSurface, AdPattern } from './types.js';
import { AD_ENDPOINTS, PLACEMENT_IDS, TRACKING_ENDPOINTS, stageForEndpoint } from './types.js';
import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { StatsStore } from './stats-store.js';
import { ShadowCapture } from './shadow-capture.js';

export class AdInterceptor {
  private config: Config;
  private logger: Logger;
  private patterns: AdPattern[];
  private stats: StatsStore | null;
  private shadow: ShadowCapture | null;
  private active: boolean;
  private requestCount: number;
  private blockCount: number;

  constructor(config: Config, logger: Logger, stats?: StatsStore, shadow?: ShadowCapture | null) {
    this.config = config;
    this.logger = logger;
    this.stats = stats ?? null;
    this.shadow = shadow ?? null;
    this.active = false;
    this.requestCount = 0;
    this.blockCount = 0;
    this.patterns = this.buildPatterns();
  }

  private buildPatterns(): AdPattern[] {
    const patterns: AdPattern[] = [];

    for (const endpoint of AD_ENDPOINTS) {
      const surface = this.classifyEndpoint(endpoint);
      if (surface && this.config.surfaces[surface]) {
        patterns.push({
          pattern: endpoint,
          surface,
          stage: stageForEndpoint(endpoint),
          priority: this.getPriority(surface),
        });
      }
    }

    // Specificity first (longest pattern first) so /api/ad/break-event is not
    // shadowed by the shorter /api/ad/break prefix; then by priority.
    return patterns.sort((a, b) => b.pattern.length - a.pattern.length || b.priority - a.priority);
  }

  private classifyEndpoint(endpoint: string): AdSurface | null {
    if (endpoint.includes('/api/ad/break-event')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/break')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/billboard')) return 'billboard';
    if (endpoint.includes('/api/ad/intermission')) return 'intermission';
    if (endpoint.includes('/api/ad/intent')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/report')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/impression')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/click')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/engagement')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/partner')) return 'partner';
    if (endpoint.includes('/api/ad/invitation')) return 'invitation';
    if (endpoint.includes('/api/ad/proposal')) return 'showcase';
    if (endpoint.includes('/api/ad/policy')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/slot')) return 'sponsorBreak';
    if (endpoint.includes('/api/ads')) return 'sponsorBreak';
    if (endpoint.includes('/api/v1/ads')) return 'sponsorBreak';
    if (endpoint.includes('/api/sponsored-survey')) return 'invitation';
    if (endpoint.includes('/api/telemetry/ad-density')) return 'sponsorBreak';
    if (endpoint.includes('/api/telemetry/display-ad')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/display')) return 'sponsorBreak';
    return null;
  }

  private getPriority(surface: AdSurface): number {
    const priorities: Record<AdSurface, number> = {
      sponsorBreak: 100,
      sponsoredCard: 95,
      billboard: 90,
      intermission: 80,
      spotlight: 70,
      showcase: 60,
      sponsoredTask: 50,
      sponsoredRun: 40,
      partner: 30,
      invitation: 20,
    };
    return priorities[surface];
  }

  updateConfig(config: Config): void {
    this.config = config;
    if (this.shadow) this.shadow.updateConfig(config.shadow);
    this.patterns = this.buildPatterns();
    this.logger.debug('Interceptor config updated', { surfaces: config.surfaces });
  }

  intercept(url: string, method: string = 'GET'): InterceptResult {
    this.requestCount++;

    const shadow = this.shadow;
    const captureEnabled = shadow?.isEnabled() ?? false;
    const captureStart = captureEnabled ? Date.now() : 0;
    const dryRun = shadow?.isDryRun() ?? false;

    if (!this.config.enabled) {
      if (captureEnabled && (shadow as ShadowCapture).shouldCapture()) {
        const { path: p, origin } = ShadowCapture.scrubPath(url, this.config.shadow.scrubQuery);
        (shadow as ShadowCapture).record({
          at: Date.now(),
          method,
          path: p,
          originHash: ShadowCapture.hashOrigin(origin),
          session: 'default',
          decision: { blocked: false },
          ms: 0,
        });
      }
      return { blocked: false };
    }

    // Tracking-only calls may be allowed through, but the ad content, policy
    // and creative routes below stay blocked either way.
    if (!this.config.blockTracking && this.isTracking(url)) {
      this.logger.debug(`Allowed tracking request: ${url}`);
      if (captureEnabled && (shadow as ShadowCapture).shouldCapture()) {
        const { path: p, origin } = ShadowCapture.scrubPath(url, this.config.shadow.scrubQuery);
        (shadow as ShadowCapture).record({ at: Date.now(), method, path: p, originHash: ShadowCapture.hashOrigin(origin), session: 'default', decision: { blocked: false, stage: 'tracking' }, ms: Date.now() - captureStart });
      }
      return { blocked: false };
    }

    for (const pattern of this.patterns) {
      if (this.matches(url, pattern.pattern)) {
        this.blockCount++;
        this.stats?.record({
          stage: pattern.stage,
          surface: pattern.surface,
          endpoint: pattern.pattern,
        });
        this.logger.debug(`Blocked ad request: ${url}`, {
          surface: pattern.surface,
          endpoint: pattern.pattern,
          stage: pattern.stage,
        });
        const result = {
          blocked: true,
          reason: `Ad surface: ${pattern.surface}`,
          surface: pattern.surface,
          endpoint: pattern.pattern,
          stage: pattern.stage,
        };
        if (captureEnabled && (shadow as ShadowCapture).shouldCapture()) {
          const { path: p, origin } = ShadowCapture.scrubPath(url, this.config.shadow.scrubQuery);
          (shadow as ShadowCapture).record({ at: Date.now(), method, path: p, originHash: ShadowCapture.hashOrigin(origin), session: 'default', decision: { blocked: !dryRun, surface: pattern.surface, stage: pattern.stage, endpoint: pattern.pattern }, ms: Date.now() - captureStart });
        }
        if (dryRun) return { blocked: false };
        return result;
      }
    }

    if (captureEnabled && (shadow as ShadowCapture).shouldCapture()) {
      const { path: p, origin } = ShadowCapture.scrubPath(url, this.config.shadow.scrubQuery);
      (shadow as ShadowCapture).record({ at: Date.now(), method, path: p, originHash: ShadowCapture.hashOrigin(origin), session: 'default', decision: { blocked: false }, ms: Date.now() - captureStart });
    }
    return { blocked: false };
  }

  private matches(url: string, pattern: string): boolean {
    // Prefix match when the pattern ends with '/', exact/substring otherwise.
    return url.includes(pattern);
  }

  private isTracking(url: string): boolean {
    return TRACKING_ENDPOINTS.some((endpoint) => this.matches(url, endpoint));
  }

  activate(): void {
    this.active = true;
    this.logger.info('Ad interceptor activated', {
      patterns: this.patterns.length,
      surfaces: Object.entries(this.config.surfaces)
        .filter(([, v]) => v)
        .map(([k]) => k),
    });
  }

  deactivate(): void {
    this.active = false;
    this.logger.info('Ad interceptor deactivated', {
      totalRequests: this.requestCount,
      blockedRequests: this.blockCount,
    });
  }

  isActive(): boolean {
    return this.active;
  }

  getStats(): { requestCount: number; blockCount: number; patterns: number } {
    return {
      requestCount: this.requestCount,
      blockCount: this.blockCount,
      patterns: this.patterns.length,
    };
  }

  getPlacementIds(): typeof PLACEMENT_IDS {
    return PLACEMENT_IDS;
  }
}
