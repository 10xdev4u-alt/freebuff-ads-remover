import { describe, it, expect } from 'vitest';
import { getConfigPath, saveConfig, watchConfig } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/types.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('watchConfig with a profile', () => {
  it('reports the watched profile, not the active one', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-profile-watch-'));
    process.env.FREEBUFF_CONFIG_DIR = base;
    process.env.FREEBUFF_PROFILE = 'work';

    // The watcher targets "dev"; the ambient profile is "work".
    saveConfig({ ...DEFAULT_CONFIG, logLevel: 'warn' }, 'dev');
    saveConfig({ ...DEFAULT_CONFIG, logLevel: 'error' });

    const seen: string[] = [];
    const unwatch = watchConfig((cfg) => seen.push(cfg.logLevel), 'dev');
    try {
      fs.writeFileSync(getConfigPath('dev'), JSON.stringify({ ...DEFAULT_CONFIG, logLevel: 'debug' }));
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      unwatch();
    }

    expect(seen).toContain('debug');
    expect(seen).not.toContain('error');
  }, 5000);
});
