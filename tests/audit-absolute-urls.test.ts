import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const repo = path.resolve(__dirname, '..');
const fixture = path.join(repo, 'tests', 'fixtures', 'payload-absolute', 'resources');

type Audit = { routes: { absolute: string[]; hostCandidates: string[]; missing: string[] }; pass: boolean };

function runAudit(): Audit {
  try {
    const out = execSync(`node scripts/audit-endpoints.mjs ${JSON.stringify(fixture)} --json`, { cwd: repo, encoding: 'utf8' });
    return JSON.parse(out) as Audit;
  } catch (e) {
    // Exit 1 is the normal "gaps found" signal; anything without a stdout report
    // is a crashed audit and must surface, not parse as an empty gap list.
    const stdout = (e as { stdout?: string }).stdout?.toString() ?? '';
    if (!stdout) throw e;
    return JSON.parse(stdout) as Audit;
  }
}

describe('audit absolute ad URLs', () => {
  beforeAll(() => {
    const interceptor = path.join(repo, 'dist', 'interceptor.js');
    if (!fs.existsSync(interceptor)) execSync('npm run build', { cwd: repo, stdio: 'inherit' });
  });

  it('sees an absolute ad URL the path-only scan misses', () => {
    const audit = runAudit();
    expect(audit.routes.absolute).toContain('https://ads.example.com/api/ad/wave59-absolute');
    expect(audit.routes.missing).toContain('https://ads.example.com/api/ad/wave59-absolute');
    expect(audit.pass).toBe(false);
  });

  it('does not treat a first-party non-ad URL as an ad route', () => {
    const audit = runAudit();
    expect(audit.routes.absolute).not.toContain('https://freebuff.com/api/chat');
    expect(audit.routes.missing).not.toContain('https://freebuff.com/api/chat');
  });

  it('reports an absolute URL whose path is already blocked', () => {
    const audit = runAudit();
    expect(audit.routes.absolute).toContain('https://freebuff.com/api/ad/break');
    expect(audit.routes.missing).not.toContain('https://freebuff.com/api/ad/break');
  });

  it('ignores query strings and non-/api ad-token paths', () => {
    const audit = runAudit();
    expect(audit.routes.absolute).not.toContain('https://freebuff.com/help?utm_campaign=spring');
    expect(audit.routes.absolute).not.toContain('https://docs.example.com/guide/ad-blocking');
    expect(audit.routes.missing).not.toContain('https://freebuff.com/help?utm_campaign=spring');
    expect(audit.routes.missing).not.toContain('https://docs.example.com/guide/ad-blocking');
  });

  it('does not flag a control route on a third-party host', () => {
    const audit = runAudit();
    expect(audit.routes.absolute).not.toContain('https://vendor.com/api/account/usage?ad=1');
    expect(audit.routes.missing).not.toContain('https://vendor.com/api/account/usage?ad=1');
  });

  it('reports a non-first-party ad host as a host candidate', () => {
    const audit = runAudit();
    expect(audit.routes.hostCandidates).toContain('https://ads.example.com/');
    expect(audit.routes.missing).toContain('https://ads.example.com/');
  });

  it('does not report a first-party ad host as a host candidate', () => {
    const audit = runAudit();
    expect(audit.routes.hostCandidates).not.toContain('https://freebuff.com/');
  });
});
