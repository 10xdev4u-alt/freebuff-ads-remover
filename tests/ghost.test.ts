import { describe, it, expect } from 'vitest';
import { rulesForPreset } from '../src/ghost/rules.js';
import { isAdContext, scrubPayload, installScrubber } from '../src/ghost/identifier-scrubber.js';
import { eraseContext } from '../src/ghost/context-eraser.js';
import { verifyStealth } from '../src/ghost/stealth-verifier.js';

describe('ghost rules', () => {
  it('standard has fewer rules than aggressive', () => {
    expect(rulesForPreset('standard').length).toBeLessThan(rulesForPreset('aggressive').length);
  });
  it('paranoid includes aggressive', () => {
    const p = rulesForPreset('paranoid').map((r) => r.id);
    expect(p).toContain('pm-redact');
    expect(p).toContain('beacon-strip');
  });
});

describe('identifier scrubber', () => {
  it('detects ad context', () => {
    expect(isAdContext({ slotId: 'x' }, ['slotId'])).toBe(true);
    expect(isAdContext({ foo: 'bar' }, ['slotId'])).toBe(false);
  });
  it('scrubs fields', () => {
    const out = scrubPayload({ slotId: 'abc', name: 'x' }, ['slotId']) as Record<string, unknown>;
    expect(out.slotId).toBe('[redacted]');
    expect(out.name).toBe('x');
  });
  it('does not mutate original', () => {
    const o = { slotId: 'abc' };
    scrubPayload(o, ['slotId']);
    expect(o.slotId).toBe('abc');
  });
  it('installScrubber chains and restores', () => {
    const host = { postMessage: (m: unknown) => m };
    const orig = host.postMessage;
    const handle = installScrubber(['slotId'], ['slotId'], host as never);
    expect(host.postMessage).not.toBe(orig);
    handle.uninstall();
    expect(host.postMessage).toBe(orig);
  });
  it('fast-path: non-ad payload untouched', () => {
    const host = { postMessage: (m: unknown) => m };
    const calls: unknown[] = [];
    const orig = (m: unknown) => { calls.push(m); return m; };
    host.postMessage = orig;
    const handle = installScrubber(['slotId'], ['slotId'], host as never);
    host.postMessage({ foo: 'bar' });
    handle.uninstall();
    expect(calls[0]).toEqual({ foo: 'bar' });
  });
});

describe('context eraser', () => {
  it('erases globals, timers, observers, styles', () => {
    const host: Record<string, unknown> = { adsbygoogle: {} };
    const obs = { disconnected: false, disconnect() { this.disconnected = true; } };
    const style = { removed: false, remove() { this.removed = true; } };
    const n = eraseContext({ globals: ['adsbygoogle'], timers: [], observers: [obs], styles: [style as unknown as Element] }, host);
    expect(n).toBe(3);
    expect(host.adsbygoogle).toBeUndefined();
    expect(obs.disconnected).toBe(true);
    expect(style.removed).toBe(true);
  });
});

describe('stealth verifier', () => {
  it('passes when after matches baseline', () => {
    const base = { markers: [], globals: [], ipcCount: 0 };
    const before = { markers: ['m1'], globals: ['g1'], ipcCount: 5 };
    const after = { markers: [], globals: [], ipcCount: 0 };
    const r = verifyStealth(before, after, base);
    expect(r.pass).toBe(true);
    expect(r.markersStripped).toBe(1);
  });
  it('fails when residue remains', () => {
    const base = { markers: [], globals: [], ipcCount: 0 };
    const before = { markers: ['m1'], globals: [], ipcCount: 0 };
    const after = { markers: ['m1'], globals: [], ipcCount: 0 };
    const r = verifyStealth(before, after, base);
    expect(r.pass).toBe(false);
    expect(r.delta).toContain('marker:m1');
  });
});
EOF
npm run lint 2>&1 | tail -2 && npx vitest run tests/ghost.test.ts 2>&1 | tail -3