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
] as const;

export type AdSurface = (typeof AD_SURFACES)[number];

export const AD_ENDPOINTS = [
  '/api/ad/policy',
  '/api/ad/break',
  '/api/ad/break-event',
  '/api/ad/billboard',
  '/api/ad/intermission',
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
  surfaces: Record<AdSurface, boolean>;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logToFile: boolean;
}

export interface InterceptResult {
  blocked: boolean;
  reason?: string;
  surface?: AdSurface;
  endpoint?: string;
}

export interface AdPattern {
  pattern: string;
  surface: AdSurface;
  priority: number;
}

export const DEFAULT_CONFIG: ExtensionConfig = {
  enabled: true,
  blockTracking: true,
  cssFallback: true,
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
};

export const HIDE_ALL_ADS_CSS = Object.values(AD_CSS_SELECTORS)
  .flat()
  .join(',\n') + ' {\n  display: none !important;\n  visibility: hidden !important;\n  opacity: 0 !important;\n  pointer-events: none !important;\n  position: absolute !important;\n  z-index: -9999 !important;\n}\n';
