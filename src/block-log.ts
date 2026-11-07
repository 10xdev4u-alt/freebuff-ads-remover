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
      // rotate if too big
      const stat = fs.statSync(this.filePath);
      if (stat.size > this.maxBytes) {
        const rotated = this.filePath + '.1';
        try { fs.renameSync(this.filePath, rotated); } catch { /* ignore */ }
      }
    } catch { /* fail open */ }
  }

  read(): BlockLogEntry[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      return fs.readFileSync(this.filePath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as BlockLogEntry);
    } catch { return []; }
  }
}
