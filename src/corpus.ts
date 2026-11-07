import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';

const EntrySchema = z.object({
  path: z.string().min(1),
  label: z.enum(['ad', 'control']),
  surface: z.string().optional(),
  stage: z.string().optional(),
  source: z.string().optional(),
});

export type GoldenEntry = z.infer<typeof EntrySchema>;

export interface Manifest {
  version: number;
  freebuffVersion: string;
  entries: number;
  ads: number;
  controls: number;
  sha256: string;
}

export function loadCorpus(corpusDir: string): { entries: GoldenEntry[]; manifest: Manifest } {
  const jsonlPath = path.join(corpusDir, 'golden.jsonl');
  const manifestPath = path.join(corpusDir, 'manifest.json');
  const raw = fs.readFileSync(jsonlPath, 'utf8').trim().split('\n').filter(Boolean);
  const entries = raw.map((l) => EntrySchema.parse(JSON.parse(l)));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
  // verify hash
  const hash = crypto.createHash('sha256').update(raw.join('\n') + '\n').digest('hex');
  if (hash !== manifest.sha256) {
    throw new Error(`corpus hash mismatch: expected ${manifest.sha256}, got ${hash}`);
  }
  if (entries.length !== manifest.entries) {
    throw new Error('corpus entry count mismatch: ' + String(entries.length) + ' vs ' + String(manifest.entries));
  }
  return { entries, manifest };
}

export function verifyCorpus(corpusDir: string): boolean {
  try { loadCorpus(corpusDir); return true; } catch { return false; }
}
