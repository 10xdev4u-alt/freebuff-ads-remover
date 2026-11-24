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
  it('accepts a script that defines the shield api in a bare context', () => {
    expect(smokeTestPageClient(BODY)).toEqual({ ok: true });
  });

  it('rejects a script that throws in the page context', () => {
    const result = smokeTestPageClient("throw new Error('boom');");
    expect(result.ok).toBe(false);
    expect(result.error).toContain('boom');
  });

  it('rejects a script that never registers the api', () => {
    const result = smokeTestPageClient('const notTheShield = 1;');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('farBuffShield');
  });
});
