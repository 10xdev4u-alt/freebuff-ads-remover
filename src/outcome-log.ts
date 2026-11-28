import fs from 'node:fs';

export interface OutcomeLogEntry { v: number; at: number; healHash: string; route: string; suppressed: boolean }

/** All JSONL lines in oldest-first order, including the rotated segment. */
export function readOutcomeLogLines(filePath: string): string[] {
  let lines: string[] = [];
  for (const segment of [filePath + '.1', filePath]) {
    if (!fs.existsSync(segment)) continue;
    try {
      lines = lines.concat(fs.readFileSync(segment, 'utf8').trim().split('\n').filter(Boolean));
    } catch { /* skip an unreadable segment */ }
  }
  return lines;
}

export class OutcomeLog {
  private filePath: string;
  private maxBytes: number;

  constructor(filePath: string, maxBytes: number = 1024 * 1024) {
    this.filePath = filePath;
    this.maxBytes = maxBytes;
  }

  append(entry: OutcomeLogEntry): void {
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

  read(opts?: { since?: number; limit?: number }): OutcomeLogEntry[] {
    let entries: OutcomeLogEntry[] = [];
    try {
      entries = readOutcomeLogLines(this.filePath).map((l) => JSON.parse(l) as OutcomeLogEntry);
    } catch { return []; }
    if (opts?.since) entries = entries.filter((e) => e.at >= (opts.since as number));
    if (opts?.limit) entries = entries.slice(-opts.limit);
    return entries;
  }
}
