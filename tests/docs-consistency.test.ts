import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkDocs } from '../scripts/docs-check.mjs';

const SURFACES = [
  'sponsorBreak', 'billboard', 'intermission', 'spotlight', 'showcase',
  'sponsoredTask', 'sponsoredRun', 'partner', 'invitation', 'sponsoredCard',
];

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-check-'));
  const write = (rel: string, content: string) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  write(
    'docs/CONFIGURATION.md',
    '- `promoteAfter` (number, default 5): number of launches\n' +
      '- `maxPromotedRules` (number, default 10): hard cap\n',
  );
  write('ROADMAP.md', '## Deprecated (verified against 0.0.201 bundle; current payload 0.0.205)\n' +
    'lines/functions/branches/statements, and the suite holds 97.5/94.0/91.3/95.7.\n');
  write('index.html', '<span>coverage 97.5% lines</span>\ncoverage:{lines:97.5,branches:91.3},\n');
  write('.github/pull_request_template.md', '- [ ] Audit deltas clean (`npm run audit:deltas`)\n');
  write(
    'docs/ARCHITECTURE.md',
    '```json\n' +
      JSON.stringify({ surfaces: Object.fromEntries(SURFACES.map((s) => [s, true])) }, null, 2) +
      '\n```\n',
  );
  return { root, deps: { defaults: { promoteAfter: 5, maxPromotedRules: 10, surfaces: SURFACES }, payloadVersion: '0.0.205' } };
}

const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });
function fixture() { const f = makeFixture(); roots.push(f.root); return f; }
function rewrite(f: ReturnType<typeof fixture>, rel: string, from: string, to: string) {
  const p = path.join(f.root, rel);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(from, to));
}

describe('docs truth gate', () => {
  it('passes a self-consistent fixture', async () => {
    const f = fixture();
    const r = await checkDocs(f.root, f.deps);
    expect(r.findings).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('fails when CONFIGURATION.md promoteAfter is stale', async () => {
    const f = fixture();
    rewrite(f, 'docs/CONFIGURATION.md', 'promoteAfter` (number, default 5', 'promoteAfter` (number, default 3');
    expect((await checkDocs(f.root, f.deps)).findings).toContain(
      'CONFIGURATION.md shield.promoteAfter default 3 != code 5',
    );
  });

  it('fails when CONFIGURATION.md maxPromotedRules is stale', async () => {
    const f = fixture();
    rewrite(f, 'docs/CONFIGURATION.md', 'maxPromotedRules` (number, default 10', 'maxPromotedRules` (number, default 25');
    expect((await checkDocs(f.root, f.deps)).findings).toContain(
      'CONFIGURATION.md shield.maxPromotedRules default 25 != code 10',
    );
  });

  it('fails when the promoteAfter row is removed', async () => {
    const f = fixture();
    rewrite(f, 'docs/CONFIGURATION.md', '- `promoteAfter` (number, default 5): number of launches\n', '');
    expect((await checkDocs(f.root, f.deps)).findings).toContain(
      'CONFIGURATION.md shield.promoteAfter default not found',
    );
  });

  it('fails when the ROADMAP Deprecated header version is stale', async () => {
    const f = fixture();
    rewrite(f, 'ROADMAP.md', '; current payload 0.0.205', '');
    expect((await checkDocs(f.root, f.deps)).findings).toContain(
      'ROADMAP Deprecated header missing current payload 0.0.205',
    );
  });

  it('fails when the PR template has no audit checkbox', async () => {
    const f = fixture();
    rewrite(f, '.github/pull_request_template.md', '- [ ] Audit deltas clean (`npm run audit:deltas`)\n', '');
    expect((await checkDocs(f.root, f.deps)).findings).toContain('PR template has no audit checkbox');
  });

  it('accepts a checked audit checkbox', async () => {
    const f = fixture();
    rewrite(f, '.github/pull_request_template.md', '- [ ] Audit', '- [x] Audit');
    expect((await checkDocs(f.root, f.deps)).findings).toEqual([]);
  });

  it('fails when ARCHITECTURE.md surfaces drift', async () => {
    const f = fixture();
    rewrite(f, 'docs/ARCHITECTURE.md', '"sponsoredCard": true', '"sponsoredCardX": true');
    expect((await checkDocs(f.root, f.deps)).findings).toContain(
      'ARCHITECTURE.md surfaces missing sponsoredCard',
    );
  });

  it('aggregates independent findings', async () => {
    const f = fixture();
    rewrite(f, 'docs/CONFIGURATION.md', 'promoteAfter` (number, default 5', 'promoteAfter` (number, default 3');
    rewrite(f, 'ROADMAP.md', '; current payload 0.0.205', '');
    const r = await checkDocs(f.root, f.deps);
    expect(r.ok).toBe(false);
    expect(r.findings.length).toBe(2);
  });
});
