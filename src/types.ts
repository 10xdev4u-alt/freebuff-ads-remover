export const AD_SURFACES = [
  'sponsorBreak',
  'billboard',
  'intermission',
  'spotlight',
  'showcase',
  'sponsoredTask',
  'sponsoredRun',
  'partner',
  'invitation',
  'sponsoredCard',
] as const;

export type AdSurface = (typeof AD_SURFACES)[number];

export const AD_STAGES = ['inventory', 'bid', 'policy', 'media', 'delivery', 'promo'] as const;

export type AdStage = (typeof AD_STAGES)[number];

/** Ad funnel order shown by the dashboard (promo is a side branch). */
export const PIPELINE_STAGES = ['inventory', 'bid', 'policy', 'media', 'delivery'] as const;

export const STAGE_LABELS: Record<AdStage, string> = {
  inventory: 'Inventory',
  bid: 'Bid',
  policy: 'Policy',
  media: 'Media',
  delivery: 'Delivery',
  promo: 'Promo',
};

/**
 * Which funnel stage an ad request dies at. Checked most-specific first:
 * break-event (a delivery event) must not fall through to break (inventory).
 */
export function stageForEndpoint(endpoint: string): AdStage {
  if (endpoint.includes('/api/ad/proposal')) return 'bid';
  if (endpoint.includes('/api/ad/policy')) return 'policy';
  if (endpoint.includes('/api/ad/invitation')) return 'promo';
  if (endpoint.includes('/api/ad/intent')) return 'inventory';
  if (endpoint.includes('/api/ad/report')) return 'delivery';
  if (endpoint.includes('creative-image')) return 'media';
  if (
    endpoint.includes('/api/ad/impression') ||
    endpoint.includes('/api/ad/click') ||
    endpoint.includes('/api/ad/engagement') ||
    endpoint.includes('/api/ad/break-event')
  ) {
    return 'delivery';
  }
  return 'inventory';
}

export const AD_ENDPOINTS = [
  '/api/ad/policy',
  '/api/ad/break',
  '/api/ad/break-event',
  '/api/ad/billboard',
  '/api/ad/intermission',
  '/api/ad/intent',
  '/api/ad/report',
  '/api/ad/impression',
  '/api/ad/click',
  '/api/ad/click-return',
  '/api/ad/engagement',
  '/api/ad/proposal',
  '/api/ad/proposal-prefs',
  '/api/ad/partner',
  '/api/ad/slot',
  '/api/ad/invitation/click',
  '/api/ad/invitation/displayed',
  '/api/ad/invitation/recheck',
  '/api/ads',
  '/api/ads/first-party/creative-image/',
  '/api/v1/ads/agentic/offer',
] as const;

export type AdEndpoint = (typeof AD_ENDPOINTS)[number];

export const PLACEMENT_IDS = {
  intermission: 'Desktop-Intermission',
  inlineChat: 'Desktop-Inline-Chat',
  belowChat: 'Desktop-Below-Chat',
  showcase: 'Desktop-Showcase',
  billboardSidebar: 'Desktop-Billboard-Sidebar',
  billboardPanel: 'Desktop-Billboard-Panel',
} as const;

export interface ExtensionConfig {
  enabled: boolean;
  blockTracking: boolean;
  cssFallback: boolean;
  dashboard: boolean;
  surfaces: Record<AdSurface, boolean>;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logToFile: boolean;
}

export interface InterceptResult {
  blocked: boolean;
  reason?: string;
  surface?: AdSurface;
  endpoint?: string;
  stage?: AdStage;
}

export interface AdPattern {
  pattern: string;
  surface: AdSurface;
  stage: AdStage;
  priority: number;
}

export interface BlockEvent {
  stage: AdStage;
  surface: AdSurface;
  endpoint: string;
  at: number;
}

export interface StatsSnapshot {
  total: number;
  at: number;
  startedAt: number;
  byStage: Record<AdStage, number>;
  bySurface: Record<AdSurface, number>;
  byEndpoint: Record<string, number>;
  recent: BlockEvent[];
  perMinute: { minute: number; count: number }[];
}

/** API the dashboard client exposes on globalThis inside the app page. */
export interface ShieldInstallOptions {
  hideSelectors: string;
  version?: string;
}

export interface FarBuffShieldApi {
  install(options: ShieldInstallOptions): void;
  update(snapshot: StatsSnapshot): void;
  unmount(): void;
  isOpen(): boolean;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  enabled: true,
  blockTracking: true,
  cssFallback: true,
  dashboard: true,
  surfaces: {
    sponsorBreak: true,
    billboard: true,
    intermission: true,
    spotlight: true,
    showcase: true,
    sponsoredTask: true,
    sponsoredRun: true,
    partner: true,
    invitation: true,
    sponsoredCard: true,
  },
  logLevel: 'info',
  logToFile: true,
};

export const AD_CSS_SELECTORS: Record<AdSurface, string[]> = {
  sponsorBreak: [
    '[class*="sponsorBreak"]',
    '[class*="sponsor-break"]',
    '[class*="SponsorBreak"]',
    '[data-ad-surface="sponsorBreak"]',
  ],
  billboard: [
    '[class*="billboard"]',
    '[class*="Billboard"]',
    '[data-ad-surface="billboard"]',
  ],
  intermission: [
    '[class*="intermission"]',
    '[class*="Intermission"]',
    '[data-ad-surface="intermission"]',
  ],
  spotlight: [
    '[class*="spotlight"]',
    '[class*="Spotlight"]',
    '[data-ad-surface="spotlight"]',
  ],
  showcase: [
    '[class*="showcase"]',
    '[class*="Showcase"]',
    '[data-ad-surface="showcase"]',
  ],
  sponsoredTask: [
    '[class*="sponsoredTask"]',
    '[class*="sponsored-task"]',
    '[data-ad-surface="sponsoredTask"]',
  ],
  sponsoredRun: [
    '[class*="sponsoredRun"]',
    '[class*="sponsored-run"]',
    '[data-ad-surface="sponsoredRun"]',
  ],
  partner: [
    '[class*="partnerAd"]',
    '[class*="partner-ad"]',
    '[data-ad-surface="partner"]',
  ],
  invitation: [
    '[class*="invitation"]',
    '[class*="Invitation"]',
    '[data-ad-surface="invitation"]',
  ],
  // In-chat sponsor cards render with these literal classes
  // (a.sponsored-ad.ad-card > .ad-content > .ad-head/.ad-detail),
  // none of which contain the legacy surface keywords above.
  sponsoredCard: [
    'a.sponsored-ad',
    'a.ad-card',
    '[class*="sponsored-ad"]',
  ],
};

export const HIDE_ALL_ADS_CSS = Object.values(AD_CSS_SELECTORS)
  .flat()
  .join(',\n') + ' {\n  display: none !important;\n  visibility: hidden !important;\n  opacity: 0 !important;\n  pointer-events: none !important;\n  position: absolute !important;\n  z-index: -9999 !important;\n}\n';
