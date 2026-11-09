import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';

export interface OutcomeEnvelope { v: number; at: number; healHash: string; route: string; suppressed: boolean }

export interface OutcomeSubmitResult { submitted: number; status: number }

export async function submitOutcomes(submitUrl: string, maxBatch: number): Promise<OutcomeSubmitResult> {
  const logPath = path.join(getConfigDir(), 'outcomes.jsonl');
  if (!fs.existsSync(logPath)) return { submitted: 0, status: 204 };
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const batch = lines.slice(-maxBatch).map((l) => JSON.parse(l) as OutcomeEnvelope);
  if (batch.length === 0) return { submitted: 0, status: 204 };
  const res = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ v: 1, envelopes: batch }),
  });
  if (res.ok) {
    const remaining = lines.slice(0, Math.max(0, lines.length - batch.length));
    fs.writeFileSync(logPath, remaining.join('\n') + (remaining.length ? '\n' : ''));
  }
  return { submitted: batch.length, status: res.status };
}
