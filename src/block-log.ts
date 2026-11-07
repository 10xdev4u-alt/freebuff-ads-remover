import fs from 'node:fs';

export interface BlockLogEntry { v: number; at: number; stage: string; surface: string; endpoint: string; session: string }

export class BlockLog {
  private filePath: string;
  private maxBytes: number;

  constructor(filePath: string, maxBytes: number = 1024 * 1024) {
    this.filePath = filePath;
    this.maxBytes = maxBytes;
  }

  append(entry: BlockLogEntry): void {
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

  read(opts?: { since?: number; limit?: number }): BlockLogEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    let entries: BlockLogEntry[] = [];
    try {
      entries = fs.readFileSync(this.filePath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as BlockLogEntry);
    } catch { return []; }
    if (opts?.since) entries = entries.filter((e) => e.at >= (opts.since as number));
    if (opts?.limit) entries = entries.slice(-opts.limit);
    return entries;
  }

  toJson(opts?: { since?: number; limit?: number }): string {
    return JSON.stringify(this.read(opts));
  }

  toCsv(opts?: { since?: number; limit?: number }): string {
    const entries = this.read(opts);
    const header = 'v,at,stage,surface,endpoint,session';
    const rows = entries.map((e) => [e.v, e.at, e.stage, e.surface, e.endpoint, e.session].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return [header, ...rows].join('\n');
  }
}
