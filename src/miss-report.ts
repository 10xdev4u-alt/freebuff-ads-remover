import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';
import type { MissEnvelope } from './miss-log.js';

export interface SubmitResult { submitted: number; status: number }

export async function submitMisses(submitUrl: string, maxBatch: number): Promise<SubmitResult> {
  const logPath = path.join(getConfigDir(), 'miss-log.jsonl');
  if (!fs.existsSync(logPath)) return { submitted: 0, status: 204 };
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const batch = lines.slice(-maxBatch).map((l) => JSON.parse(l) as MissEnvelope);
  if (batch.length === 0) return { submitted: 0, status: 204 };
  const res = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ v: 1, envelopes: batch }),
  });
  if (res.ok) {
    // truncate submitted
    const remaining = lines.slice(0, Math.max(0, lines.length - batch.length));
    fs.writeFileSync(logPath, remaining.join('\n') + (remaining.length ? '\n' : ''));
  }
  return { submitted: batch.length, status: res.status };
}
