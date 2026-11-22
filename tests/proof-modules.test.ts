import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { getInstallId, hashedInstallId, installIdPath } from '../src/install-id.js';
import { submitMisses } from '../src/miss-report.js';
import { submitOutcomes } from '../src/outcome-report.js';
import { buildTrustReport } from '../src/trust-report.js';
import { buildDomProbeScript } from '../src/dom-probe.js';
import { runAutopilot } from '../src/autopilot.js';
import { RuleRegistry } from '../src/rule-registry.js';

let dir: string;
const oldConfigDir = process.env.FREEBUFF_CONFIG_DIR;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-proof-'));
  process.env.FREEBUFF_CONFIG_DIR = dir;
});

afterEach(() => {
  if (oldConfigDir === undefined) delete process.env.FREEBUFF_CONFIG_DIR;
  else process.env.FREEBUFF_CONFIG_DIR = oldConfigDir;
  fs.rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('install-id', () => {
  it('creates a stable id on first use and reuses it', () => {
    const first = getInstallId();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(fs.existsSync(installIdPath())).toBe(true);
    expect(getInstallId()).toBe(first);
  });

  it('returns an existing id without rewriting it', () => {
    fs.writeFileSync(installIdPath(), '  fixed-id  \n');
    expect(getInstallId()).toBe('fixed-id');
  });

  it('hashes the id with the salt', () => {
    const a = hashedInstallId('salt-a');
    const b = hashedInstallId('salt-b');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(hashedInstallId('salt-a')).toBe(a);
  });
});

describe('miss-report', () => {
  it('reports 204 when there is no log', async () => {
    await expect(submitMisses('https://example.test/submit', 10)).resolves.toEqual({ submitted: 0, status: 204 });
  });

  it('submits the batch and truncates the log on success', async () => {
    const log = path.join(dir, 'miss-log.jsonl');
    fs.writeFileSync(log, JSON.stringify({ v: 1, route: '/api/ad/a' }) + '\n' + JSON.stringify({ v: 1, route: '/api/ad/b' }) + '\n');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    await expect(submitMisses('https://example.test/submit', 10)).resolves.toEqual({ submitted: 2, status: 200 });
    expect(fs.readFileSync(log, 'utf8')).toBe('');
  });

  it('keeps the log when the submit fails', async () => {
    const log = path.join(dir, 'miss-log.jsonl');
    fs.writeFileSync(log, JSON.stringify({ v: 1, route: '/api/ad/a' }) + '\n');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(submitMisses('https://example.test/submit', 10)).resolves.toEqual({ submitted: 1, status: 500 });
    expect(fs.readFileSync(log, 'utf8').trim()).not.toBe('');
  });
});

describe('outcome-report', () => {
  it('reports 204 when there is no log', async () => {
    await expect(submitOutcomes('https://example.test/submit', 10)).resolves.toEqual({ submitted: 0, status: 204 });
  });

  it('submits the batch and truncates the log on success', async () => {
    const log = path.join(dir, 'outcomes.jsonl');
    fs.writeFileSync(log, JSON.stringify({ v: 1, healHash: 'h', route: '/api/ad/a', suppressed: true }) + '\n');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    await expect(submitOutcomes('https://example.test/submit', 10)).resolves.toEqual({ submitted: 1, status: 200 });
    expect(fs.readFileSync(log, 'utf8')).toBe('');
  });
});

describe('trust-report', () => {
  it('binds the current rule set and corpus size', () => {
    const registry = new RuleRegistry();
    const report = buildTrustReport(registry, 42);
    expect(report.ruleVersion).toBe(registry.current().version);
    expect(report.ruleHash).toBe(registry.current().hash);
    expect(report.corpusEntries).toBe(42);
    const canonical = JSON.stringify({ ruleVersion: report.ruleVersion, ruleHash: report.ruleHash, corpusEntries: 42 });
    expect(report.reportHash).toBe(crypto.createHash('sha256').update(canonical).digest('hex'));
  });

  it('changes when the rule set changes', () => {
    const registry = new RuleRegistry();
    registry.apply({ addEndpoints: ['/api/ad/new'], addSelectors: {}, source: 'test' });
    expect(buildTrustReport(registry, 42).ruleHash).not.toBe(new RuleRegistry().current().hash);
  });
});

describe('dom-probe', () => {
  it('emits a self-contained probe script', () => {
    const s = buildDomProbeScript();
    expect(s).toContain('__farBuffDomArmor');
    expect(s).toContain('far-canary');
    expect(s).toContain('data-far-control');
    expect(s).toContain('requestAnimationFrame');
  });
});

describe('autopilot', () => {
  const corpusDir = path.join(process.cwd(), 'corpus');

  it('does nothing when the audit has no gaps', () => {
    const result = runAutopilot({ routes: { missing: [] } }, corpusDir, false, dir);
    expect(result.delta).toBeNull();
    expect(result.gate.pass).toBe(true);
    expect(result.promoted).toBe(false);
  });

  it('promotes a synthesized delta that passes the gate', () => {
    const result = runAutopilot({ routes: { missing: ['/api/ad/autopilot-new'] } }, corpusDir, false, dir);
    expect(result.delta).not.toBeNull();
    expect(result.gate.pass).toBe(true);
    expect(result.promoted).toBe(true);
    expect(fs.existsSync(path.join(dir, 'rules.json'))).toBe(true);
  });

  it('does not promote in dry-run', () => {
    const result = runAutopilot({ routes: { missing: ['/api/ad/autopilot-new'] } }, corpusDir, true, dir);
    expect(result.promoted).toBe(false);
    expect(fs.existsSync(path.join(dir, 'rules.json'))).toBe(false);
  });

  it('refuses a delta that collides with a protected route', () => {
    const result = runAutopilot({ routes: { missing: ['/api/config'] } }, corpusDir, false, dir);
    expect(result.gate.pass).toBe(false);
    expect(result.gate.reason).toBe('protected-route-collision');
    expect(result.promoted).toBe(false);
  });
});
