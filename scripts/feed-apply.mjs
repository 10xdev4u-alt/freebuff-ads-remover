// Applies a signed feed to a config dir the way the launcher does
// (launch-freebuff.sh:324), and reports what was delivered.
//
// The E2E harness used to accept `--feed` and only set a config field the app
// never reads, so the proof workflow's "feed was applied" guard could never
// pass and the flag proved nothing. This module is the single apply path: it
// runs the same `feed-sync.mjs` invocation the launcher runs, then requires
// the delivery receipt and materialized rules.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const feedSyncScript = fileURLToPath(new URL('./feed-sync.mjs', import.meta.url));

export function applyFeed({ manifest, configDir, publicKey, previousPublicKey = '' }) {
  if (!manifest || !configDir || !publicKey) {
    throw new Error('applyFeed requires manifest, configDir and publicKey');
  }
  const r = spawnSync(
    process.execPath,
    [feedSyncScript, '--manifest', manifest, '--config-dir', configDir],
    {
      env: { ...process.env, FEED_PUBLIC_KEY: publicKey, FEED_PREVIOUS_PUBLIC_KEY: previousPublicKey },
      encoding: 'utf8',
    },
  );
  if (r.status !== 0) {
    throw new Error(`feed-sync exited ${r.status}: ${(r.stderr || r.stdout || '').trim()}`);
  }
  const receiptPath = join(configDir, 'delivery-receipt.json');
  const rulesPath = join(configDir, 'feed-rules.json');
  for (const p of [receiptPath, rulesPath]) {
    if (!existsSync(p)) throw new Error(`feed-sync did not produce ${p}`);
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
  return {
    receipt,
    rules,
    extraEndpoints: Array.isArray(rules.addEndpoints) ? rules.addEndpoints : [],
  };
}
