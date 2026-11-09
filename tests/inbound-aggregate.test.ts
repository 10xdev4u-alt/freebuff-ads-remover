import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';

const repo = path.resolve(__dirname, '..');

describe('inbound aggregate', () => {
  beforeAll(() => {
    const dist = path.join(repo, 'dist', 'candidates.js');
    if (!fs.existsSync(dist)) execSync('npm run build', { cwd: repo, stdio: 'inherit' });
  });

  it('aggregates corroborated misses', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-in-'));
    const envelopes = [
      { route: '/api/monetize', host: '127.0.0.1', method: 'POST', installIdHash: 'a' },
      { route: '/api/monetize', host: '127.0.0.1', method: 'POST', installIdHash: 'b' },
      { route: '/api/monetize', host: '127.0.0.1', method: 'POST', installIdHash: 'c' },
    ];
    const input = path.join(tmp, 'env.json');
    fs.writeFileSync(input, JSON.stringify({ envelopes }));
    const out = path.join(tmp, 'cand.json');
    execSync(`node scripts/inbound-aggregate.mjs --input ${JSON.stringify(input)} --out ${JSON.stringify(out)} --min-installs 3`, { cwd: repo, encoding: 'utf8' });
    const res = JSON.parse(fs.readFileSync(out, 'utf8')) as { candidates: { route: string }[] };
    expect(res.candidates.map((c) => c.route)).toContain('/api/monetize');
  });

  it('vetoes control routes', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-in-'));
    const envelopes = Array.from({ length: 3 }, (_, i) => ({ route: '/healthz', host: '127.0.0.1', method: 'POST', installIdHash: String(i) }));
    const input = path.join(tmp, 'env.json');
    fs.writeFileSync(input, JSON.stringify({ envelopes }));
    const out = path.join(tmp, 'cand.json');
    execSync(`node scripts/inbound-aggregate.mjs --input ${JSON.stringify(input)} --out ${JSON.stringify(out)} --min-installs 3`, { cwd: repo, encoding: 'utf8' });
    const res = JSON.parse(fs.readFileSync(out, 'utf8')) as { candidates: { route: string }[] };
    expect(res.candidates.map((c) => c.route)).not.toContain('/healthz');
  });
});
