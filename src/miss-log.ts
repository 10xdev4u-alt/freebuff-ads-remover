import fs from 'node:fs';

export interface MissLogEntry { v: number; at: number; route: string; surface?: string }

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
    if (!fs.existsSync(this.filePath)) return [];
    let entries: MissLogEntry[] = [];
    try {
      entries = fs.readFileSync(this.filePath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as MissLogEntry);
    } catch { return []; }
    if (opts?.since) entries = entries.filter((e) => e.at >= (opts.since as number));
    if (opts?.limit) entries = entries.slice(-opts.limit);
    return entries;
  }
}
