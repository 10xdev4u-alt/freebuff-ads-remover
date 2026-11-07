import { describe, it, expect } from 'vitest';
import { GhostRuntime } from '../src/ghost/runtime.js';

describe('ghost runtime', () => {
  it('disabled by default does not activate', () => {
    const r = new GhostRuntime({ enabled: false, preset: 'standard' });
    r.activate();
    expect(r.report().active).toBe(false);
  });
  it('enabled activates', () => {
    const r = new GhostRuntime({ enabled: true, preset: 'standard' });
    r.activate();
    expect(r.report().active).toBe(true);
  });
  it('updateConfig toggles', () => {
    const r = new GhostRuntime({ enabled: true, preset: 'standard' });
    r.activate();
    r.updateConfig({ enabled: false, preset: 'standard' });
    expect(r.report().active).toBe(false);
  });
});
