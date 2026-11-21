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

/**
 * True when the pid recorded in the sentinel belongs to a process that is
 * still alive (and is not us). A live process has not crashed, so its
 * sentinel must not be counted as an unclean exit.
 */
function sentinelIsLive(): boolean {
  let pid = 0;
  try { pid = Number(fs.readFileSync(sentinelPath(), 'utf8').trim()); } catch { return false; }
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by another user.
    return (err as NodeJS.ErrnoException | undefined)?.code === 'EPERM';
  }
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
      let c = readCount();
      // Consume the sentinel so one unclean exit is counted exactly once.
      if (fs.existsSync(sentinelPath()) && !sentinelIsLive()) {
        c += 1;
        try {
          fs.writeFileSync(counterPath(), String(c));
          fs.rmSync(sentinelPath(), { force: true });
        } catch { /* ignore */ }
      }
      if (c >= CRASH_THRESHOLD) {
        // Reset so the user can retry after investigating.
        try { fs.writeFileSync(counterPath(), '0'); } catch { /* ignore */ }
        return false;
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
