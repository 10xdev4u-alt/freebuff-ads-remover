import fs from 'node:fs';

export type MissLogEntry = { v: number; at: number; route: string; surface?: string };

/** All JSONL lines in oldest-first order, including the rotated segment. */
export function readMissLogLines(filePath: string): string[] {
  let lines: string[] = [];
  for (const segment of [filePath + '.1', filePath]) {
    if (!fs.existsSync(segment)) continue;
    try {
      lines = lines.concat(fs.readFileSync(segment, 'utf8').trim().split('\n').filter(Boolean));
    } catch { /* skip an unreadable segment */ }
  }
  return lines;
}

export interface MissEnvelope {
  v: number;
  at: number;
  route: string;
  host?: string;
  method?: string;
  surface?: string;
  appVersion?: string;
  extVersion?: string;
  installIdHash?: string;
  signals?: string[];
}

export class MissLog {
  private filePath: string;
  private maxBytes: number;

  constructor(filePath: string, maxBytes: number = 1024 * 1024) {
    this.filePath = filePath;
    this.maxBytes = maxBytes;
  }

  append(entry: MissLogEntry): void {
    const line = JSON.stringify(entry) + '\n';
    try {
      fs.appendFileSync(this.filePath, line);
      const stat = fs.statSync(this.filePath);
      if (stat.size > this.maxBytes) {
        const rotated = this.filePath + '.1';
        try { fs.renameSync(this.filePath, rotated); } catch { /* ignore */ }
      }
    } catch { /* fail open */ }
  }

  read(opts?: { since?: number; limit?: number }): MissLogEntry[] {
    let entries: MissLogEntry[] = [];
    try {
      entries = readMissLogLines(this.filePath).map((l) => JSON.parse(l) as MissLogEntry);
    } catch { return []; }
    if (opts?.since) entries = entries.filter((e) => e.at >= (opts.since as number));
    if (opts?.limit) entries = entries.slice(-opts.limit);
    return entries;
  }
}
