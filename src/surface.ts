import type { AdSurface } from './types.js';

/**
 * Which ad surface an endpoint belongs to. Shared by the interceptor (blocking
 * priority) and the corpus/audit tooling (classification), so a route cannot be
 * labelled one surface at runtime and another in the corpus.
 */
export function classifyEndpoint(endpoint: string): AdSurface {
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
  // Token fallback for synthesized/healed routes.
  const lower = endpoint.toLowerCase();
  if (lower.includes('billboard')) return 'billboard';
  if (lower.includes('intermission')) return 'intermission';
  if (lower.includes('spotlight')) return 'spotlight';
  if (lower.includes('showcase') || lower.includes('proposal')) return 'showcase';
  if (lower.includes('partner')) return 'partner';
  if (lower.includes('invitation') || lower.includes('survey')) return 'invitation';
  if (lower.includes('sponsored-task') || lower.includes('sponsoredtask')) return 'sponsoredTask';
  if (lower.includes('sponsored-run') || lower.includes('sponsoredrun')) return 'sponsoredRun';
  if (lower.includes('sponsored-card') || lower.includes('sponsoredcard')) return 'sponsoredCard';
  return 'sponsorBreak';
}
