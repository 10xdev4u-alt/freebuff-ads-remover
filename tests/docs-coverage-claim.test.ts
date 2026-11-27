import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkDocs } from '../scripts/docs-check.mjs';

const SURFACES = [
  'sponsorBreak', 'billboard', 'intermission', 'spotlight', 'showcase',
  'sponsoredTask', 'sponsoredRun', 'partner', 'invitation', 'sponsoredCard',
];
const deps = { defaults: { promoteAfter: 5, maxPromotedRules: 10, surfaces: SURFACES }, payloadVersion: '0.0.205' };

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-coverage-'));
  const write = (rel: string, content: string) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  write('docs/CONFIGURATION.md',
    '- `promoteAfter` (number, default 5): x\n- `maxPromotedRules` (number, default 10): y\n');
  write('.github/pull_request_template.md', '- [ ] Audit deltas clean (`npm run audit:deltas`)\n');
  write('docs/ARCHITECTURE.md', '```json\n' + JSON.stringify({ surfaces: Object.fromEntries(SURFACES.map((s) => [s, true])) }) + '\n```\n');
  write('index.html', '<span>coverage 97.5% lines</span>\ncoverage:{lines:97.5,branches:91.3},\n');
  write('ROADMAP.md',
    '## Deprecated (verified against 0.0.201 bundle; current payload 0.0.205)\n' +
      'lines/functions/branches/statements, and the suite holds 97.5/94.0/91.3/95.7.\n');
  return { root, write };
}

const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });
function fixture() { const f = makeFixture(); roots.push(f.root); return f; }
function replace(f: ReturnType<typeof fixture>, rel: string, from: string, to: string) {
  const p = path.join(f.root, rel);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(from, to));
}

describe('ROADMAP coverage claim gate', () => {
  it('passes when the claim matches the index pins', async () => {
    expect((await checkDocs(fixture().root, deps)).findings).toEqual([]);
  });

  it('fails when the claimed lines figure is stale', async () => {
    const f = fixture();
    replace(f, 'ROADMAP.md', 'holds 97.5/94.0/91.3/95.7', 'holds 97.1/94.0/91.3/95.7');
    expect((await checkDocs(f.root, deps)).findings).toContain(
      'ROADMAP coverage lines 97.1 != index 97.5',
    );
  });

  it('fails when the claimed branches figure is stale', async () => {
    const f = fixture();
    replace(f, 'ROADMAP.md', 'holds 97.5/94.0/91.3/95.7', 'holds 97.5/94.0/91.2/95.7');
    expect((await checkDocs(f.root, deps)).findings).toContain(
      'ROADMAP coverage branches 91.2 != index 91.3',
    );
  });

  it('fails when the coverage claim is missing', async () => {
    const f = fixture();
    replace(f, 'ROADMAP.md', 'lines/functions/branches/statements, and the suite holds 97.5/94.0/91.3/95.7.\n', '');
    expect((await checkDocs(f.root, deps)).findings).toContain('ROADMAP coverage claim not found');
  });
});
