import { describe, it, expect } from 'vitest';
import { runGate } from '../src/gate.js';
import path from 'node:path';

describe('gate', () => {
  it('passes on main corpus', () => {
    const r = runGate(path.join(process.cwd(), 'corpus'));
    expect(r.pass).toBe(true);
    expect(r.missedAds).toHaveLength(0);
    expect(r.falsePositives).toHaveLength(0);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
  });
});
