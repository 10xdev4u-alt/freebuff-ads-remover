import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const repo = path.resolve(__dirname, '..');

describe('loop drill', () => {
  it('runs end to end against the payload-gap fixture', () => {
    const env = { ...process.env, FEED_SIGNING_PRIVATE_KEY: fs.readFileSync('/tmp/feed-private.pem', 'utf8') };
    execSync(`node scripts/loop-drill.mjs --json`, { cwd: repo, env, stdio: 'pipe' });
    // drill wrote a receipt
    const receipts = fs.readdirSync(path.join(repo, 'receipts')).filter((f) => f.startsWith('drill-'));
    expect(receipts.length).toBeGreaterThan(0);
  });
});
