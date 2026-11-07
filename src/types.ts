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
  if (endpoint.includes('/api/sponsored-survey')) return 'promo';
  if (endpoint.includes('/api/telemetry/ad-density')) return 'delivery';
  if (endpoint.includes('/api/telemetry/display-ad')) return 'delivery';
  if (endpoint.includes('/api/ad/display')) return 'delivery';
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
  // Prefix, not a leaf: 0.0.186 added /api/ad/invitation/git/{inspect,preview,approve,decline,open-root}.
  '/api/ad/invitation',
  '/api/ads',
  '/api/ads/first-party/creative-image/',
  // Prefix: covers every remote ad call (agentic/offer, impression, click,
  // engagement, invitation/*, policy, prefs, proposal, sponsored-skills).
  '/api/v1/ads',
  // Sponsored survey prompt (advertiser questionnaire served through the orchestrator).
  '/api/sponsored-survey',
  '/api/telemetry/ad-density',
  '/api/telemetry/display-ad',
  '/api/ad/display',
] as const;

export type AdEndpoint = (typeof AD_ENDPOINTS)[number];

/**
 * Delivery bookkeeping, not ad delivery: these calls only report that an ad
 * was rendered, clicked or ignored. Blocking them starves the ad server of
 * analytics but does not remove anything, so `blockTracking: false` lets them
 * through while every content, policy and creative route stays blocked.
 *
 * `intercept()` checks this list before the ad patterns because matching is
 * substring-based: the broader `/api/ad/break` pattern also contains
 * `/api/ad/break-event`, and the v1 prefix covers every v1 ad call.
 */
export const TRACKING_ENDPOINTS = [
  '/api/ad/impression',
  '/api/ad/click', // also covers /api/ad/click-return
  '/api/ad/engagement',
  '/api/ad/break-event',
  '/api/ad/report',
  '/api/ad/invitation/click',
  '/api/ad/invitation/displayed',
  '/api/v1/ads/impression',
  '/api/v1/ads/click', // also covers /api/v1/ads/click-return
  '/api/v1/ads/engagement',
  '/api/v1/ads/invitation/click',
  '/api/v1/ads/invitation/event',
] as const;

export const PLACEMENT_IDS = {
  intermission: 'Desktop-Intermission',
  inlineChat: 'Desktop-Inline-Chat',
  belowChat: 'Desktop-Below-Chat',
  showcase: 'Desktop-Showcase',
  billboardSidebar: 'Desktop-Billboard-Sidebar',
  billboardPanel: 'Desktop-Billboard-Panel',
} as const;


export interface ExtensionConfig {
  preset: 'strict' | 'balanced' | 'minimal' | null;
  enabled: boolean;
  blockTracking: boolean;
  cssFallback: boolean;
  dashboard: boolean;
  domRemoval: boolean;
  verify: {
    enabled: boolean;
    port: number;
    runOnBoot: boolean;
    settleMs: number;
    timeoutMs: number;
    probeRoutes: string[];
    controlRoutes: string[];
    concurrency: number;
    orchestratorOrigin: string;
  };
  shadow: {
    enabled: boolean;
    dryRun: boolean;
    captureDir: string;
    maxFileBytes: number;
    maxFiles: number;
    sampleRate: number;
    scrubQuery: boolean;
    captureControls: boolean;
    recallFloor: number;
    precisionFloor: number;
  };
  ghost: {
    enabled: boolean;
    preset: 'standard' | 'aggressive' | 'paranoid';
  };
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
  preset: null,
  enabled: true,
  blockTracking: true,
  cssFallback: true,
  dashboard: true,
  domRemoval: false,
  verify: {
    enabled: false,
    port: 0,
    runOnBoot: false,
    settleMs: 8000,
    timeoutMs: 30000,
    probeRoutes: ['/api/ad/policy', '/api/ad/break', '/api/ad/billboard', '/api/ad/impression', '/api/telemetry/ad-density'],
    controlRoutes: ['/healthz', '/api/account/usage'],
    concurrency: 8,
    orchestratorOrigin: 'http://127.0.0.1:5174',
  },
  shadow: {
    enabled: false,
    dryRun: false,
    captureDir: '',
    maxFileBytes: 8388608,
    maxFiles: 5,
    sampleRate: 1.0,
    scrubQuery: true,
    captureControls: true,
    recallFloor: 0.99,
    precisionFloor: 1.0,
  },
  ghost: {
    enabled: false,
    preset: 'standard',
  },
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
    // 0.0.186 partner units: a.partner-placement.partner-placement-{composer,skill-picker,...}
    '[class*="partner-placement"]',
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
    // 0.0.192 new ad surfaces
    '[class*="ad-home-takeover"]',
    '[class*="ad-top-banner"]',
    '[class*="ad-mcp-card"]',
    '[class*="ad-sponsor"]',
    '[class*="ad-report-dialog"]',
    // 0.0.196 hosted workspace: proposal/setup/thread ads all share the
    // sponsored-* prefix (sponsored-proposal, sponsored-setup-card, etc.)
    '[class*="sponsored-"]',
    '[class*="tab-sponsored"]',
    '[class*="ad-banner"]',
    '[class*="ad-with-reward"]',
    '[class*="ad-reward"]',
    '[class*="ad-greptile"]',
    '[class*="ad-posthog"]',
    // 0.0.201: child nodes of sponsored-card / ad-banner roots. These are
    // normally hidden by the parent rule, but an explicit rule makes the
    // hide robust against re-parenting or partial renders.
    '.ad-advertiser-link',
    '.ad-content',
    '.ad-copy',
    '.ad-destination',
    '.ad-detail',
    '.ad-disclosure',
    '.ad-favicon',
    '.ad-head',
    '.ad-heading',
    '.ad-image',
    '.ad-title',
  ],
};

export const HIDE_ALL_ADS_CSS = Object.values(AD_CSS_SELECTORS)
  .flat()
  .join(',\n') + ' {\n  display: none !important;\n  visibility: hidden !important;\n  opacity: 0 !important;\n  pointer-events: none !important;\n  position: absolute !important;\n  z-index: -9999 !important;\n}\n';
