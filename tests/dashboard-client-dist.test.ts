import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { sanitizePageClient, smokeTestPageClient } from '../scripts/page-client-guard.mjs';

const distPath = join(process.cwd(), 'dist', 'dashboard-client.js');
const distExists = existsSync(distPath);

// A normal `npm test` may run before a build (CI's test job does exactly that),
// so absence is a skip there. The build job and release:check set
// FAR_REQUIRE_DIST=1 and require the artifact to exist.
if (!distExists && process.env.FAR_REQUIRE_DIST === '1') {
  throw new Error('dist/dashboard-client.js is missing; run npm run build first');
}

const distSource = distExists ? readFileSync(distPath, 'utf8') : '';

interface ShieldSandbox {
  farBuffShield?: { install?: unknown; update?: unknown; unmount?: unknown };
}

describe.runIf(distSource.length > 0)('built dashboard client (dist fidelity)', () => {
  it('contains no module syntax the page could choke on', () => {
    const result = sanitizePageClient(distSource);
    expect(result.findings).toEqual([]);
    // The built artifact must already be sanitized, not merely sanitizable.
    expect(result.code).toBe(distSource);
  });

  it('evaluates in a bare context without module globals', async () => {
    const sanitized = sanitizePageClient(distSource).code;
    expect(await smokeTestPageClient(sanitized)).toEqual({ ok: true });
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
