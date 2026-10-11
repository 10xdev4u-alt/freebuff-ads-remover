import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const distPath = join(process.cwd(), 'dist', 'dashboard-client.js');
const distSource = existsSync(distPath) ? readFileSync(distPath, 'utf8') : '';

interface ShieldSandbox {
  farBuffShield?: { install?: unknown; update?: unknown; unmount?: unknown };
}

describe.runIf(distSource.length > 0)('built dashboard client (dist fidelity)', () => {
  it('contains no CommonJS or ESM syntax the page could choke on', () => {
    expect(distSource).not.toMatch(/\brequire\s*\(/);
    expect(distSource).not.toMatch(/\bmodule\.exports\b/);
    expect(distSource).not.toMatch(/^Object\.defineProperty\(exports/m);
    expect(distSource).not.toMatch(/^\s*import\s/m);
    expect(distSource).not.toMatch(/^\s*export\s/m);
  });

  it('registers the shield api when evaluated as a plain script', () => {
    const sandbox: ShieldSandbox = {};
    expect(() => {
      runInNewContext(distSource, sandbox);
    }).not.toThrow();
    expect(sandbox.farBuffShield).toBeDefined();
    expect(typeof sandbox.farBuffShield?.update).toBe('function');
    expect(typeof sandbox.farBuffShield?.install).toBe('function');
    expect(typeof sandbox.farBuffShield?.unmount).toBe('function');
  });

  it('exposes the same api shape as the source module', () => {
    const sandbox: ShieldSandbox = {};
    runInNewContext(distSource, sandbox);
    const api = sandbox.farBuffShield as Record<string, unknown> | undefined;
    expect(api).toBeDefined();
    expect(Object.keys(api ?? {}).sort()).toEqual(['install', 'isOpen', 'unmount', 'update']);
  });
});

describe('dist fidelity guard presence', () => {
  it('either has a built client to verify or is skipped pre-build', () => {
    expect(typeof distSource).toBe('string');
  });
});
