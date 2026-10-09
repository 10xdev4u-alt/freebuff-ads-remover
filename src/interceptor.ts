import type { InterceptResult, AdSurface, AdPattern } from './types.js';
import { AD_ENDPOINTS, PLACEMENT_IDS } from './types.js';
import type { Config } from './config.js';
import type { Logger } from './logger.js';

export class AdInterceptor {
  private config: Config;
  private logger: Logger;
  private patterns: AdPattern[];
  private active: boolean;
  private requestCount: number;
  private blockCount: number;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
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
          priority: this.getPriority(surface),
        });
      }
    }

    return patterns.sort((a, b) => b.priority - a.priority);
  }

  private classifyEndpoint(endpoint: string): AdSurface | null {
    if (endpoint.includes('/api/ad/break-event')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/break')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/billboard')) return 'billboard';
    if (endpoint.includes('/api/ad/intermission')) return 'intermission';
    if (endpoint.includes('/api/ad/impression')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/click')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/engagement')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/partner')) return 'partner';
    if (endpoint.includes('/api/ad/invitation')) return 'invitation';
    if (endpoint.includes('/api/ad/proposal')) return 'showcase';
    if (endpoint.includes('/api/ad/policy')) return 'sponsorBreak';
    if (endpoint.includes('/api/ad/slot')) return 'sponsorBreak';
    if (endpoint.includes('/api/ads')) return 'sponsorBreak';
    if (endpoint.includes('/api/v1/ads/agentic/offer')) return 'sponsorBreak';
    return null;
  }

  private getPriority(surface: AdSurface): number {
    const priorities: Record<AdSurface, number> = {
      sponsorBreak: 100,
      billboard: 90,
      intermission: 80,
      spotlight: 70,
      showcase: 60,
      sponsoredTask: 50,
      sponsoredRun: 40,
      partner: 30,
      invitation: 20,
    };
    return priorities[surface] ?? 0;
  }

  updateConfig(config: Config): void {
    this.config = config;
    this.patterns = this.buildPatterns();
    this.logger.debug('Interceptor config updated', { surfaces: config.surfaces });
  }

  intercept(url: string, _method?: string): InterceptResult {
    this.requestCount++;

    if (!this.config.enabled) {
      return { blocked: false };
    }

    for (const pattern of this.patterns) {
      if (this.matches(url, pattern.pattern)) {
        this.blockCount++;
        this.logger.debug(`Blocked ad request: ${url}`, {
          surface: pattern.surface,
          endpoint: pattern.pattern,
        });
        return {
          blocked: true,
          reason: `Ad surface: ${pattern.surface}`,
          surface: pattern.surface,
          endpoint: pattern.pattern,
        };
      }
    }

    return { blocked: false };
  }

  private matches(url: string, pattern: string): boolean {
    if (pattern.endsWith('/')) {
      return url.includes(pattern);
    }
    return url.includes(pattern);
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
