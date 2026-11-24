import { describe, it, expect } from 'vitest';
import { sanitizePageClient, smokeTestPageClient } from '../scripts/page-client-guard.mjs';

// The one CommonJS statement tsc emits for a module whose only imports are
// type-only. Everything else must be rejected.
const MARKER = 'Object.defineProperty(exports, "__esModule", { value: true });';
const BODY = [
  '(() => {',
  '  const api = { install() {}, update() {}, unmount() {}, isOpen() { return false; } };',
  '  globalThis.farBuffShield = api;',
  '})();',
].join('\n');

describe('sanitizePageClient', () => {
  it('removes the tolerated marker and changes nothing else', () => {
    const result = sanitizePageClient(`${MARKER}\n${BODY}`);
    expect(result.markersRemoved).toBe(1);
    expect(result.findings).toEqual([]);
    expect(result.code).toBe(BODY);
  });

  it('leaves an already page-safe file untouched', () => {
    const result = sanitizePageClient(BODY);
    expect(result.markersRemoved).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.code).toBe(BODY);
  });

  it('rejects a require call even when it spans lines', () => {
    const result = sanitizePageClient(`${BODY}\nconst fs = require(\n  'fs'\n);`);
    expect(result.findings.join('\n')).toContain('`require` reference');
  });

  it('rejects free module/exports references', () => {
    const result = sanitizePageClient(`${BODY}\nmodule.exports = {};\nexports.foo = 1;`);
    const findings = result.findings.join('\n');
    expect(findings).toContain('`module` reference');
    expect(findings).toContain('`exports` reference');
  });

  it('rejects emitted import and export declarations', () => {
    const result = sanitizePageClient(`${BODY}\nimport fs from 'fs';\nexport const answer = 42;`);
    const findings = result.findings.join('\n');
    expect(findings).toContain('import declaration');
    expect(findings).toContain('export declaration');
  });

  it('allows those words as property names', () => {
    const result = sanitizePageClient(`${BODY}\nconst options = { exports: 1, module: 2, require: 3 };\noptions.exports;`);
    expect(result.findings).toEqual([]);
  });

  it('removes every marker, including CRLF line endings', () => {
    const crlf = sanitizePageClient(`${MARKER}\r\n${MARKER}\r\n${BODY}`);
    expect(crlf.markersRemoved).toBe(2);
    expect(crlf.code).toBe(BODY);
    expect(crlf.findings).toEqual([]);

    const lf = sanitizePageClient(`${MARKER}\n${MARKER}\n${BODY}`);
    expect(lf.markersRemoved).toBe(2);
    expect(lf.code).toBe(BODY);
    expect(lf.findings).toEqual([]);
  });

  it('rejects Node-only globals even inside function bodies', () => {
    const result = sanitizePageClient(`${BODY}\nfunction leak() { return process.env.SECRET; }\nconst buf = Buffer.from('x');`);
    const findings = result.findings.join('\n');
    expect(findings).toContain('`process` reference');
    expect(findings).toContain('`Buffer` reference');
  });

  it('rejects globalThis access to module globals', () => {
    const result = sanitizePageClient(`${BODY}\nglobalThis.require('fs');`);
    expect(result.findings.join('\n')).toContain('globalThis.require');
  });

  it('rejects dynamic import() and import.meta', () => {
    const dynamic = sanitizePageClient(`${BODY}\nimport('fs');`);
    expect(dynamic.findings.join('\n')).toContain('dynamic import()');
    const meta = sanitizePageClient(`${BODY}\nconst base = import.meta.url;`);
    expect(meta.findings.join('\n')).toContain('import.meta');
  });

  it('does not flag names the script binds itself', () => {
    const result = sanitizePageClient(`${BODY}\nconst require = 1;\nmodule: for (;;) { break module; }`);
    expect(result.findings).toEqual([]);
  });

  it('fails closed on a syntax error instead of trusting the regexes', () => {
    const result = sanitizePageClient('const = ;');
    expect(result.findings.join('\n')).toContain('parse error');
    expect(result.code).toBe('const = ;');
  });

  it('fails closed on an empty file', () => {
    const result = sanitizePageClient('   \n');
    expect(result.findings.join('\n')).toContain('empty');
    expect(result.markersRemoved).toBe(0);
  });
});

describe('smokeTestPageClient', () => {
  it('accepts a script that defines the shield api in a bare context', async () => {
    expect(await smokeTestPageClient(BODY)).toEqual({ ok: true });
  });

  it('rejects a script that throws in the page context', async () => {
    const result = await smokeTestPageClient("throw new Error('boom');");
    expect(result.ok).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('rejects a script that never registers the api', async () => {
    const result = await smokeTestPageClient('const notTheShield = 1;');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('farBuffShield');
  });

  it('reports an async failure instead of calling the script page-safe', async () => {
    const result = await smokeTestPageClient("Promise.reject(new Error('async boom'));");
    expect(result.ok).toBe(false);
    expect(result.error).toContain('async');
  });

  it('rejects a dynamic import in the page context', async () => {
    const result = await smokeTestPageClient("import('fs');");
    expect(result.ok).toBe(false);
  });
});
