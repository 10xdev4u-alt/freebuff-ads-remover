import { describe, it, expect } from 'vitest';
import { classifyEndpoint } from '../src/surface.js';

describe('classifyEndpoint', () => {
  it('classifies the ad-prefixed routes', () => {
    expect(classifyEndpoint('/api/ad/break-event')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/break')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/billboard')).toBe('billboard');
    expect(classifyEndpoint('/api/ad/intermission')).toBe('intermission');
    expect(classifyEndpoint('/api/ad/intent')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/report')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/impression')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/click')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/engagement')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/policy')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/slot')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/ad/display')).toBe('sponsorBreak');
  });

  it('classifies partner, invitation and showcase routes', () => {
    expect(classifyEndpoint('/api/ad/partner')).toBe('partner');
    expect(classifyEndpoint('/api/ad/invitation')).toBe('invitation');
    expect(classifyEndpoint('/api/ad/proposal')).toBe('showcase');
    expect(classifyEndpoint('/api/sponsored-survey')).toBe('invitation');
  });

  it('classifies the generic ads and telemetry routes', () => {
    expect(classifyEndpoint('/api/ads')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/v1/ads')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/telemetry/ad-density')).toBe('sponsorBreak');
    expect(classifyEndpoint('/api/telemetry/display-ad')).toBe('sponsorBreak');
  });

  it('falls back to tokens for synthesized or healed routes', () => {
    expect(classifyEndpoint('/api/v2/billboard/rotate')).toBe('billboard');
    expect(classifyEndpoint('/api/v2/intermission/rotate')).toBe('intermission');
    expect(classifyEndpoint('/api/v2/spotlight/rotate')).toBe('spotlight');
    expect(classifyEndpoint('/api/v2/showcase/rotate')).toBe('showcase');
    expect(classifyEndpoint('/api/v2/partner/rotate')).toBe('partner');
    expect(classifyEndpoint('/api/v2/invitation/rotate')).toBe('invitation');
    expect(classifyEndpoint('/api/v2/sponsored-task/rotate')).toBe('sponsoredTask');
    expect(classifyEndpoint('/api/v2/sponsored-run/rotate')).toBe('sponsoredRun');
    expect(classifyEndpoint('/api/v2/sponsored-card/rotate')).toBe('sponsoredCard');
    expect(classifyEndpoint('/api/v2/sponsoredtask/rotate')).toBe('sponsoredTask');
    expect(classifyEndpoint('/api/v2/sponsoredrun/rotate')).toBe('sponsoredRun');
    expect(classifyEndpoint('/api/v2/sponsoredcard/rotate')).toBe('sponsoredCard');
    expect(classifyEndpoint('/api/v2/survey/rotate')).toBe('invitation');
  });

  it('defaults unknown routes to sponsorBreak', () => {
    expect(classifyEndpoint('/api/user/me')).toBe('sponsorBreak');
  });
});
