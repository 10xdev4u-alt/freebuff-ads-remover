/**
 * Crash-loop protection. Tracks unclean exits via a sentinel file. After
 * CRASH_THRESHOLD consecutive unclean exits, the extension refuses to activate
 * (fail-open for the host) and resets the counter so the user can retry.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';

const CRASH_THRESHOLD = 3;
const SENTINEL = 'running.sentinel';
const COUNTER = 'crash-count';

function sentinelPath(): string { return path.join(getConfigDir(), SENTINEL); }
function counterPath(): string { return path.join(getConfigDir(), COUNTER); }

function readCount(): number {
  try { return Number(fs.readFileSync(counterPath(), 'utf8').trim()) || 0; }
  catch { return 0; }
}

export interface CrashGuard {
  /** Returns false if we should refuse to activate (crash loop). */
  shouldActivate(): boolean;
  /** Call on successful activation. */
  markRunning(): void;
  /** Call on clean deactivation. */
  markCleanExit(): void;
  /** Current crash count (for diagnostics). */
  count(): number;
}

export function createCrashGuard(): CrashGuard {
  return {
    shouldActivate() {
      const c = readCount();
      if (c >= CRASH_THRESHOLD) {
        // Reset so the user can retry after investigating.
        try { fs.writeFileSync(counterPath(), '0'); } catch { /* ignore */ }
        return false;
      }
      // If a previous run didn't exit cleanly, count it.
      if (fs.existsSync(sentinelPath())) {
        try { fs.writeFileSync(counterPath(), String(c + 1)); } catch { /* ignore */ }
      }
      return true;
    },
    markRunning() {
      try {
        fs.mkdirSync(getConfigDir(), { recursive: true });
        fs.writeFileSync(sentinelPath(), String(process.pid));
      } catch { /* ignore */ }
    },
    markCleanExit() {
      try { fs.rmSync(sentinelPath(), { force: true }); } catch { /* ignore */ }
      try { fs.writeFileSync(counterPath(), '0'); } catch { /* ignore */ }
    },
    count() { return readCount(); },
  };
}
