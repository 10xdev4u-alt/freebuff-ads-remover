import { describe, it, expect } from 'vitest';
import { AD_ENDPOINTS, AD_STAGES, stageForEndpoint, STAGE_LABELS, PIPELINE_STAGES } from '../src/types.js';
import type { AdStage } from '../src/types.js';

describe('ad stages', () => {
  const expected: Record<string, AdStage> = {
    '/api/ad/policy': 'policy',
    '/api/ad/break': 'inventory',
    '/api/ad/break-event': 'delivery',
    '/api/ad/billboard': 'inventory',
    '/api/ad/intermission': 'inventory',
    '/api/ad/intent': 'inventory',
    '/api/ad/report': 'delivery',
    '/api/ad/impression': 'delivery',
    '/api/ad/click': 'delivery',
    '/api/ad/click-return': 'delivery',
    '/api/ad/engagement': 'delivery',
    '/api/ad/proposal': 'bid',
    '/api/ad/proposal-prefs': 'bid',
    '/api/ad/partner': 'inventory',
    '/api/ad/slot': 'inventory',
    '/api/ad/invitation/click': 'promo',
    '/api/ad/invitation/displayed': 'promo',
    '/api/ad/invitation/recheck': 'promo',
    '/api/ads': 'inventory',
    '/api/ads/first-party/creative-image/': 'media',
    '/api/v1/ads/agentic/offer': 'inventory',
  };

  it('maps every known endpoint to a stage', () => {
    for (const endpoint of AD_ENDPOINTS) {
      expect(stageForEndpoint(endpoint), endpoint).toBe(expected[endpoint]);
    }
  });

  it('covers every endpoint in the table (no silent misses)', () => {
    expect(Object.keys(expected).sort()).toEqual([...AD_ENDPOINTS].sort());
  });

  it('exposes six stages with labels', () => {
    expect(AD_STAGES).toEqual(['inventory', 'bid', 'policy', 'media', 'delivery', 'promo']);
    for (const stage of AD_STAGES) {
      expect(STAGE_LABELS[stage]).toBeTruthy();
    }
  });

  it('orders the pipeline without the promo offshoot', () => {
    expect(PIPELINE_STAGES).toEqual(['inventory', 'bid', 'policy', 'media', 'delivery']);
    expect(PIPELINE_STAGES).not.toContain('promo');
  });

  it('unknown endpoints fall back to inventory', () => {
    expect(stageForEndpoint('/api/whatever')).toBe('inventory');
  });
});
