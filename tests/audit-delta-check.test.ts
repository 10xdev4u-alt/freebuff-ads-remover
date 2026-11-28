import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { checkAuditDeltas } from '../scripts/audit-delta-check.mjs';
import { verifyDelta } from '../src/delta-gate.js';
import { classifyRoute } from '../src/candidates.js';
import { RuleRegistry } from '../src/rule-registry.js';
import { AD_ENDPOINTS } from '../src/types.js';

const sha = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

// The scripts job does not build dist, so inject the same functions from src.
const deps = { verifyDelta, classifyRoute, RuleRegistry };

const dirs: string[] = [];

function makeFixture(): { root: string; baseline: { routes: string[]; classifications: Record<string, unknown> } } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-delta-'));
  dirs.push(root);
  const write = (rel: string, content: string): void => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  const ad = AD_ENDPOINTS[0];
  const control = '/api/account/usage';
  const corpus = `${JSON.stringify({ path: ad, label: 'ad' })}\n${JSON.stringify({ path: control, label: 'control' })}\n`;
  write('corpus/golden.jsonl', corpus);
  write(
    'corpus/manifest.json',
    JSON.stringify({ version: 1, freebuffVersion: '0.0.205', entries: 2, ads: 1, controls: 1, sha256: sha(corpus) }),
  );
  write('config/generated-rules.json', JSON.stringify({ addEndpoints: [], addSelectors: {}, source: 'ci-healed:test' }));

  const baseline = { routes: ['/api/chat'], classifications: { '/api/chat': classifyRoute('/api/chat') } };
  write('config/endpoint-baseline.json', JSON.stringify({ version: 1, payloadVersion: '0.0.205', ...baseline }));
  return { root, baseline };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('checkAuditDeltas', () => {
  it('accepts a consistent fixture', () => {
    const { root } = makeFixture();
    const result = checkAuditDeltas(root, deps);
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('ignores classification key order', () => {
    const { root, baseline } = makeFixture();
    const original = baseline.classifications['/api/chat'] as Record<string, unknown>;
    const reordered = { signals: original.signals, confidence: original.confidence, candidate: original.candidate };
    fs.writeFileSync(
      path.join(root, 'config', 'endpoint-baseline.json'),
      JSON.stringify({ version: 1, routes: ['/api/chat'], classifications: { '/api/chat': reordered } }),
    );
    expect(checkAuditDeltas(root, deps).ok).toBe(true);
  });

  it('rejects a delta that blocks a control route', () => {
    const { root } = makeFixture();
    fs.writeFileSync(
      path.join(root, 'config', 'generated-rules.json'),
      JSON.stringify({ addEndpoints: ['/api'], addSelectors: {}, source: 'test' }),
    );
    const findings = checkAuditDeltas(root, deps).findings.join('\n');
    expect(findings).toContain('protected-route-collision');
  });

  it('rejects a host rule aimed at Freebuff itself', () => {
    const { root } = makeFixture();
    fs.writeFileSync(
      path.join(root, 'config', 'generated-rules.json'),
      JSON.stringify({ addEndpoints: [], addHosts: ['freebuff.com'], addSelectors: {}, source: 'test' }),
    );
    const findings = checkAuditDeltas(root, deps).findings.join('\n');
    expect(findings).toContain('protected-host-collision');
  });

  it('rejects a malformed delta instead of skipping it', () => {
    const { root } = makeFixture();
    fs.writeFileSync(path.join(root, 'config', 'generated-rules.json'), '{ not json');
    const findings = checkAuditDeltas(root, deps).findings.join('\n');
    expect(findings).toContain('not valid JSON');
  });

  it('rejects a baseline classification that the classifier no longer produces', () => {
    const { root } = makeFixture();
    fs.writeFileSync(
      path.join(root, 'config', 'endpoint-baseline.json'),
      JSON.stringify({
        version: 1,
        routes: ['/api/chat'],
        classifications: { '/api/chat': { candidate: true, confidence: 0.9, signals: ['forged'] } },
      }),
    );
    expect(checkAuditDeltas(root, deps).findings.join('\n')).toContain('classification drift: /api/chat');
  });

  it('reports a route without a classification and vice versa', () => {
    const { root } = makeFixture();
    fs.writeFileSync(
      path.join(root, 'config', 'endpoint-baseline.json'),
      JSON.stringify({ version: 1, routes: ['/api/chat', '/api/other'], classifications: { '/api/chat': classifyRoute('/api/chat') } }),
    );
    const findings = checkAuditDeltas(root, deps).findings.join('\n');
    expect(findings).toContain('baseline route without classification: /api/other');
  });

  it('fails closed when the baseline is missing', () => {
    const { root } = makeFixture();
    fs.rmSync(path.join(root, 'config', 'endpoint-baseline.json'));
    expect(checkAuditDeltas(root, deps).findings.join('\n')).toContain('endpoint-baseline.json is missing');
  });

  it('reports a corrupt corpus instead of passing silently', () => {
    const { root } = makeFixture();
    fs.writeFileSync(path.join(root, 'corpus', 'manifest.json'), JSON.stringify({ version: 1, sha256: 'deadbeef' }));
    const findings = checkAuditDeltas(root, deps).findings.join('\n');
    expect(findings).toContain('delta gate failed to run');
  });
});
