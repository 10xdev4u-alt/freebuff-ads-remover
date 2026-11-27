import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const repo = path.resolve(__dirname, '..');
const goldens = path.join(repo, 'tests', 'fixtures', 'audit-golden');

type Audit = {
  freebuffVersion: string | null;
  routes: {
    total: number;
    blocked: number;
    missing: string[];
    missingDetail: unknown[];
    candidates: unknown[];
    absolute: string[];
    hostCandidates: string[];
    classifications: Record<string, unknown>;
  };
  dom: { total: number; covered: number; gaps: string[] };
  css: { total: number; covered: number; gaps: string[] };
  baseline: { newRoutes: string[]; changedClassification: string[] };
  pass: boolean;
};

function runAudit(fixture: string): Audit {
  const dir = path.join(repo, 'tests', 'fixtures', fixture, 'resources');
  const args = ['scripts/audit-endpoints.mjs', dir, '--json'];
  try {
    return JSON.parse(execFileSync(process.execPath, args, { cwd: repo, encoding: 'utf8' })) as Audit;
  } catch (error) {
    const stdout = (error as { stdout?: string }).stdout?.toString() ?? '';
    if (!stdout) throw error;
    return JSON.parse(stdout) as Audit;
  }
}

beforeAll(() => {
  const interceptor = path.join(repo, 'dist', 'interceptor.js');
  if (fs.existsSync(interceptor)) return;
  const npmExecpath = process.env.npm_execpath;
  if (!npmExecpath) throw new Error('dist/interceptor.js is missing; run npm run build before tests');
  execFileSync(process.execPath, [npmExecpath, 'run', 'build'], {
    cwd: repo, stdio: 'inherit',
  });
});

describe('audit JSON golden contract', () => {
  it('pins the full audit summary for the absolute-URL fixture', () => {
    const goldenPath = path.join(goldens, 'payload-absolute.json');
    expect(fs.existsSync(goldenPath), 'run the audit once to capture the golden').toBe(true);
    const actual = runAudit('payload-absolute');
    expect(actual).toEqual(JSON.parse(fs.readFileSync(goldenPath, 'utf8')));
  });

  it('pins the full audit summary for the payload-gap fixture', () => {
    const goldenPath = path.join(goldens, 'payload-gap.json');
    expect(fs.existsSync(goldenPath), 'run the audit once to capture the golden').toBe(true);
    const actual = runAudit('payload-gap');
    expect(actual).toEqual(JSON.parse(fs.readFileSync(goldenPath, 'utf8')));
  });

  it('emits the payload version that self-heal consumes', () => {
    for (const fixture of ['payload-absolute', 'payload-gap']) {
      const audit = runAudit(fixture);
      expect(audit.freebuffVersion, fixture).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('pins the heal-consumed route and DOM fields as load-bearing facts', () => {
    const absolute = runAudit('payload-absolute');
    expect(absolute.routes.missing).toContain('https://ads.example.com/api/ad/wave59-absolute');
    expect(absolute.routes.hostCandidates).toEqual(expect.any(Array));
    expect(absolute.dom.gaps).toEqual(expect.any(Array));
    expect(absolute.routes.classifications).toEqual(expect.any(Object));
    expect(absolute.pass).toBe(false);

    const gap = runAudit('payload-gap');
    expect(gap.routes.missing).toContain('/api/ad/wave29-proof');
    expect(gap.pass).toBe(false);
  });
});
