// Multi-signal candidate classifier for ad-shaped upstream routes.
//
// The runtime observer and the audit tool used to share one narrow heuristic
// (`isAdRoute`): a route was either ad-shaped or invisible. That made a
// renamed or non-ad-prefixed route disappear entirely. This module ranks a
// route by several independent signals and returns a confidence instead of a
// boolean. The corpus gate remains the final authority.

export interface RouteContext {
  host?: string;
  module?: string;
  params?: string[];
}

export interface CandidateResult {
  candidate: boolean;
  confidence: number;
  signals: string[];
}

const AD_TOKENS = [
  'ad', 'ads', 'advert', 'advertising', 'monetize', 'monetization', 'reward',
  'rewarded', 'promo', 'promotion', 'offer', 'offers', 'impression',
  'impressions', 'click', 'clicks', 'break', 'breaks', 'billboard',
  'intermission', 'spotlight', 'showcase', 'partner', 'partners', 'invitation',
  'invitations', 'survey', 'surveys', 'proposal', 'proposals', 'slot', 'slots',
  'intent', 'report', 'reports', 'engagement', 'density', 'display', 'campaign',
  'campaigns', 'creative', 'creatives', 'placement', 'placements', 'sponsor',
  'sponsored', 'sponsorship',
];

const AD_PARAM_NAMES = new Set([
  'placement', 'placementid', 'campaign', 'campaignid', 'creative', 'creativeid',
  'sponsor', 'sponsorid', 'adid', 'adunit', 'adunitid',
]);

// Known-good endpoints that must never be synthesized into blocking rules, even
// if a signal fires. This replaces the previous dead `!isAdRoute` no-op.
export const CONTROL_ROUTES = new Set<string>([
  '/healthz',
  '/api/account/usage',
  '/api/user/me',
  '/api/auth/session',
  '/api/config',
]);

// Segments that, when present, indicate a non-ad route even if an ad token
// appears elsewhere (e.g. "admission" contains "ad" but is not an ad route).
export const NOT_AD_SEGMENTS = new Set<string>([
  'admission', 'threads', 'thread', 'reload', 'profile', 'survey-events',
]);

export const CORE_ROUTES = CONTROL_ROUTES;

const FIRST_PARTY_HOSTS = new Set(['127.0.0.1', 'localhost', 'freebuff.com', 'www.freebuff.com']);

function tokensOf(route: string): string[] {
  return route.toLowerCase().split(/[^a-z0-9]+/).filter((seg): seg is string => Boolean(seg));
}

function hostOf(context: RouteContext | undefined, route: string): string | undefined {
  if (context?.host) return context.host.toLowerCase();
  try {
    const u = new URL(route, 'http://127.0.0.1');
    return u.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function classifyRoute(route: string, context: RouteContext = {}): CandidateResult {
  const signals: string[] = [];
  let score = 0;

  const toksCheck = tokensOf(route);
  const pathSegments = route.toLowerCase().split('/').map((seg) => seg.split('?')[0]).filter((seg): seg is string => Boolean(seg));
  if (toksCheck.some((t) => NOT_AD_SEGMENTS.has(t)) || pathSegments.some((seg) => NOT_AD_SEGMENTS.has(seg))) {
    return { candidate: false, confidence: 0, signals: ['not-ad-segment'] };
  }
  if (CONTROL_ROUTES.has(route)) {
    return { candidate: false, confidence: 0, signals: ['control-list'] };
  }

  const toks = tokensOf(route);
  const pathHits = AD_TOKENS.filter((t) => toks.some((x) => x === t));
  if (pathHits.length > 0) {
    signals.push(`path:${pathHits.join(',')}`);
    score += Math.min(0.9, 0.7 + 0.1 * (pathHits.length - 1));
  }

  const host = hostOf(context, route);
  if (host && !FIRST_PARTY_HOSTS.has(host)) {
    signals.push(`host:${host}`);
    score += 0.25;
  }

  if (context.module) {
    const mod = context.module.toLowerCase();
    if (/ad|monet|sponsor|promo|creative/.test(mod)) {
      signals.push(`module:${context.module}`);
      score += 0.15;
    }
  }

  const params = context.params ?? [];
  const paramHits = params.filter((p) => AD_PARAM_NAMES.has(p.toLowerCase()));
  if (paramHits.length > 0) {
    signals.push(`params:${paramHits.join(',')}`);
    score += Math.min(0.2, 0.1 * paramHits.length);
  }

  const confidence = Math.min(1, Number(score.toFixed(3)));
  const candidate = confidence >= 0.35;
  if (!candidate) signals.push('below-threshold');
  return { candidate, confidence, signals };
}
