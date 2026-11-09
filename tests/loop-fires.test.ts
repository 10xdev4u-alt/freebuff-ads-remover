import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const repo = path.resolve(__dirname, '..');
const fixture = path.join(repo, 'tests', 'fixtures', 'payload-gap', 'resources');

describe('loop fires for real', () => {
  beforeAll(() => {
    const interceptor = path.join(repo, 'dist', 'interceptor.js');
    if (!fs.existsSync(interceptor)) {
      execSync('npm run build', { cwd: repo, stdio: 'inherit' });
    }
  });
  it('audits the fixture and reports the wave29 gap', () => {
    let out = '';
    try {
      out = execSync(`node scripts/audit-endpoints.mjs ${JSON.stringify(fixture)} --json`, { cwd: repo, encoding: 'utf8' });
    } catch (e) {
      out = (e as { stdout?: string }).stdout?.toString() ?? '';
    }
    const audit = JSON.parse(out) as { routes: { missing: string[] }; pass: boolean };
    expect(audit.routes.missing).toContain('/api/ad/wave29-proof');
    expect(audit.pass).toBe(false);
  });

  it('heals the fixture into the expected artifact', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-loop-'));
    const outPath = path.join(tmp, 'rules.json');
    const receiptPath = path.join(tmp, 'receipt.json');
    const raw = execSync(
      `node scripts/self-heal.mjs --resources ${JSON.stringify(fixture)} --out ${JSON.stringify(outPath)} --receipt ${JSON.stringify(receiptPath)} --json`,
      { cwd: repo, encoding: 'utf8' },
    );
    const res = JSON.parse(raw) as { pass: boolean; addedEndpoints: string[] };
    expect(res.pass).toBe(true);
    expect(res.addedEndpoints).toContain('/api/ad/wave29-proof');
    const artifact = JSON.parse(fs.readFileSync(outPath, 'utf8')) as Record<string, unknown>;
    const expected = JSON.parse(fs.readFileSync(path.join(repo, 'tests', 'fixtures', 'payload-gap', 'expected-rules.json'), 'utf8')) as Record<string, unknown>;
    expect(artifact).toEqual(expected);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as { gate: { pass: boolean } };
    expect(receipt.gate.pass).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'endpoint-baseline.json'))).toBe(true);
  });
});
