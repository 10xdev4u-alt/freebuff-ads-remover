import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';
import { readMissLogLines, type MissEnvelope } from './miss-log.js';

export interface SubmitResult { submitted: number; status: number }

export async function submitMisses(submitUrl: string, maxBatch: number): Promise<SubmitResult> {
  const logPath = path.join(getConfigDir(), 'miss-log.jsonl');
  const lines = readMissLogLines(logPath);
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
    try { fs.unlinkSync(logPath + '.1'); } catch { /* no rotated segment */ }
  }
  return { submitted: batch.length, status: res.status };
}
