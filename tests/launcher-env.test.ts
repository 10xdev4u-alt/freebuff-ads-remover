import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Same sourcing trick as launcher-extract.test.ts: drop the final `main` call
// and exercise the shell functions directly.
const launcherPath = join(process.cwd(), 'scripts', 'launch-freebuff.sh');
const e2ePath = join(process.cwd(), 'scripts', 'e2e-headless.mjs');

let root: string;
let harness: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'far-launch-env-'));
  const src = readFileSync(launcherPath, 'utf8');
  harness = join(root, 'harness.sh');
  writeFileSync(harness, src.replace(/^main "\$@"\s*$/m, ''));
  chmodSync(harness, 0o755);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const HOSTILE: Record<string, string> = {
  ELECTRON_RUN_AS_NODE: '1',
  ELECTRON_NO_ASAR: '1',
  ELECTRON_OVERRIDE_DIST_PATH: '/tmp/evil',
  ELECTRON_INSTALL_PLATFORM: 'linux',
  ELECTRON_INSTALL_ARCH: 'x64',
  ELECTRON_DEBUG_DRAGON: '1',
  ELECTRON_FORCE_WINDOW_MENU_BAR: '1',
  ELECTRON_TRASH: 'trash',
  ELECTRON_ENABLE_LOGGING: '1',
  ELECTRON_LOG_FILE: '/tmp/evil.log',
  ELECTRON_LOG_ASAR_READS: '1',
  ELECTRON_ENABLE_STACK_DUMPING: '1',
  NODE_OPTIONS: '--require /tmp/evil.js',
  NODE_PATH: '/tmp/evil',
  LD_PRELOAD: '/tmp/evil.so',
};

function sanitizeWithHostileEnv(): string {
  const names = Object.keys(HOSTILE).join(' ');
  const snippet = 'source "$1"; sanitize_env; for n in ' + names + '; do if [ -n "${!n+x}" ]; then echo "LEAK:$n"; fi; done; echo "KEEP:${FREEBUFF_CONFIG_DIR:-}"; echo "PROFILE:${FREEBUFF_PROFILE:-}"';
  const r = spawnSync(
    'bash',
    ['-c', snippet, '_', harness],
    { encoding: 'utf8', env: { ...process.env, ...HOSTILE, FREEBUFF_CONFIG_DIR: '/tmp/far-config', FREEBUFF_PROFILE: 'work' } },
  );
  return `${r.stdout}\n${r.stderr}`;
}

describe('launch-freebuff sanitize_env', () => {
  it('drops every hostile variable and keeps the intended knobs', () => {
    const out = sanitizeWithHostileEnv();
    expect(out).not.toContain('LEAK:');
    expect(out).toContain('KEEP:/tmp/far-config');
    expect(out).toContain('PROFILE:work');
  });

  it('runs before any exec of the app binary', () => {
    const src = readFileSync(launcherPath, 'utf8');
    const sanitizeAt = src.indexOf('  sanitize_env\n');
    expect(sanitizeAt).toBeGreaterThan(-1);
    for (const execLine of src.match(/^  exec "/gm) ?? []) {
      expect(sanitizeAt).toBeLessThan(src.indexOf(execLine));
    }
  });

  it('survives a closed stdout pipe before exec', () => {
    const log = join(root, 'launch.log');
    const script = [
      'set -euo pipefail',
      'exec 1> >(exit 0)',
      'sleep 0.05',
      `FREEBUFF_LOG=${JSON.stringify(log)}`,
      `source ${JSON.stringify(harness)}`,
      'redirect_own_output',
      'say marker',
      'echo SURVIVED',
    ].join('\n');
    const r = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: { ...process.env, HOME: root },
    });
    expect(r.status).toBe(0);
    const text = readFileSync(log, 'utf8');
    expect(text).toContain('marker');
    expect(text).toContain('SURVIVED');
  });

  it('wires the configured feed kill switch into feed-sync', () => {
    const src = readFileSync(launcherPath, 'utf8');
    expect(src).toContain('config-get --dir "$USER_CONFIG" feed.killSwitch');
    expect(src).toContain('FREEBUFF_FEED_KILL_SWITCH="$FEED_KILL"');
  });

  it('keeps the same deny list as the headless E2E launcher', () => {
    const bashList = (readFileSync(launcherPath, 'utf8').match(/SANITIZED_ENV_VARS=\(([\s\S]*?)\n\)/) ?? [])[1] ?? '';
    const jsList = (readFileSync(e2ePath, 'utf8').match(/const SANITIZED_ENV_VARS = \[([\s\S]*?)\];/) ?? [])[1] ?? '';
    const bashNames = [...bashList.matchAll(/^\s*([A-Z0-9_]+)\s*$/gm)].map((m) => m[1]);
    const jsNames = [...jsList.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(jsNames).toEqual(bashNames);
    expect(bashNames).toContain('ELECTRON_RUN_AS_NODE');
  });
});
