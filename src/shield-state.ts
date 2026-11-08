import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const ObservationSchema = z.object({
  count: z.number().int().nonnegative().default(0),
  firstAt: z.number().default(0),
  lastAt: z.number().default(0),
  launches: z.number().int().nonnegative().default(0),
  lastLaunchId: z.string().default(''),
});

const PromotedSchema = z.object({
  route: z.string(),
  at: z.number(),
  deltaHash: z.string().optional(),
});

const QuarantinedSchema = z.object({
  route: z.string(),
  at: z.number(),
  reason: z.string(),
});

const ShieldStateSchema = z.object({
  version: z.number().int().default(1),
  launchId: z.string().default(''),
  observations: z.record(z.string(), ObservationSchema).default(() => ({})),
  promoted: z.array(PromotedSchema).default(() => []),
  quarantined: z.array(QuarantinedSchema).default(() => []),
});

export type ShieldState = z.infer<typeof ShieldStateSchema>;

export class ShieldStateStore {
  private filePath: string;
  private state: ShieldState;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.state = this.load();
  }

  private load(): ShieldState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return ShieldStateSchema.parse(JSON.parse(raw));
      }
    } catch { /* fail open */ }
    return ShieldStateSchema.parse({});
  }

  private writeNow(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    } catch { /* fail open */ }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.dirty) { this.dirty = false; this.writeNow(); }
    }, 200);
  }

  flush(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (this.dirty) { this.dirty = false; this.writeNow(); }
  }

  save(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.dirty = false;
    this.writeNow();
  }

  beginLaunch(): string {
    const id = new Date().toISOString();
    this.state.launchId = id;
    this.save();
    return id;
  }

  get launchId(): string { return this.state.launchId; }

  observe(id: string, launchId?: string): void {
    const lid = launchId ?? this.state.launchId;
    const now = Date.now();
    const o = this.state.observations[id] ?? { count: 0, firstAt: now, lastAt: now, launches: 0, lastLaunchId: '' };
    o.count += 1;
    o.lastAt = now;
    if (o.firstAt === 0) o.firstAt = now;
    if (lid && o.lastLaunchId !== lid) {
      o.launches += 1;
      o.lastLaunchId = lid;
    }
    this.state.observations[id] = o;
    this.dirty = true;
    this.scheduleSave();
  }

  launches(id: string): number {
    return this.state.observations[id]?.launches ?? 0;
  }

  isQuarantined(id: string): boolean {
    return this.state.quarantined.some((q) => q.route === id);
  }

  quarantine(id: string, reason: string): void {
    if (this.isQuarantined(id)) return;
    this.state.quarantined.push({ route: id, at: Date.now(), reason });
    this.save();
  }

  promote(id: string, deltaHash?: string): void {
    this.state.promoted.push({ route: id, at: Date.now(), deltaHash });
    this.save();
  }

  promotedCount(): number { return this.state.promoted.length; }

  eligible(promoteAfter: number): string[] {
    return Object.entries(this.state.observations)
      .filter(([, o]) => o.launches >= promoteAfter)
      .map(([id]) => id)
      .filter((id) => !this.isQuarantined(id));
  }
}
