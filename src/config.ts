import { readFileSync, writeFileSync, existsSync, mkdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { DEFAULT_CONFIG } from './types.js';
import type { ExtensionConfig } from './types.js';

const configSchema = z.object({
  enabled: z.boolean().default(true),
  preset: z.enum(['strict','balanced','minimal']).nullable().default(null),
  blockTracking: z.boolean().default(true),
  cssFallback: z.boolean().default(true),
  dashboard: z.boolean().default(true),
  domRemoval: z.boolean().default(false),
  verify: z
    .object({
      enabled: z.boolean().default(false),
      port: z.number().int().min(0).max(65535).default(0),
      runOnBoot: z.boolean().default(false),
      settleMs: z.number().int().positive().default(8000),
      timeoutMs: z.number().int().positive().default(30000),
      probeRoutes: z.array(z.string()).default(['/api/ad/policy', '/api/ad/break', '/api/ad/billboard', '/api/ad/impression', '/api/telemetry/ad-density']),
      controlRoutes: z.array(z.string()).default(['/healthz', '/api/account/usage']),
      concurrency: z.number().int().min(1).max(16).default(8),
      orchestratorOrigin: z.url().default('http://127.0.0.1:5174'),
    })
    .default(() => ({
      enabled: false,
      port: 0,
      runOnBoot: false,
      settleMs: 8000,
      timeoutMs: 30000,
      probeRoutes: ['/api/ad/policy', '/api/ad/break', '/api/ad/billboard', '/api/ad/impression', '/api/telemetry/ad-density'],
      controlRoutes: ['/healthz', '/api/account/usage'],
      concurrency: 8,
      orchestratorOrigin: 'http://127.0.0.1:5174',
    })),
  surfaces: z
    .object({
      sponsorBreak: z.boolean().default(true),
      billboard: z.boolean().default(true),
      intermission: z.boolean().default(true),
      spotlight: z.boolean().default(true),
      showcase: z.boolean().default(true),
      sponsoredTask: z.boolean().default(true),
      sponsoredRun: z.boolean().default(true),
      partner: z.boolean().default(true),
      invitation: z.boolean().default(true),
      sponsoredCard: z.boolean().default(true),
    })
    .default(() => ({ ...DEFAULT_CONFIG.surfaces })),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logToFile: z.boolean().default(true),
});

export type Config = z.infer<typeof configSchema>;

export function getConfigDir(): string {
  if (process.env.FREEBUFF_CONFIG_DIR) return process.env.FREEBUFF_CONFIG_DIR;
  return join(homedir(), '.config', 'freebuff-ads-remover');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

export type Preset = 'strict' | 'balanced' | 'minimal';

export const PRESETS: Record<Preset, Partial<ExtensionConfig>> = {
  strict: {
    blockTracking: true,
    cssFallback: true,
    domRemoval: true,
    surfaces: {
      sponsorBreak: true, billboard: true, intermission: true, spotlight: true,
      showcase: true, sponsoredTask: true, sponsoredRun: true, partner: true, invitation: true, sponsoredCard: true,
    },
  },
  balanced: {},
  minimal: {
    blockTracking: false,
    cssFallback: false,
    domRemoval: false,
    surfaces: {
      sponsorBreak: true, billboard: true, intermission: false, spotlight: false,
      showcase: false, sponsoredTask: false, sponsoredRun: false, partner: false, invitation: false, sponsoredCard: false,
    },
  },
};

export function loadConfig(): Config {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    const merged: Config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      surfaces: { ...DEFAULT_CONFIG.surfaces, ...parsed.surfaces },
    };
    if (merged.preset && PRESETS[merged.preset]) {
      Object.assign(merged, PRESETS[merged.preset]);
      if (PRESETS[merged.preset].surfaces) {
        merged.surfaces = { ...merged.surfaces, ...PRESETS[merged.preset].surfaces };
      }
    }
    return configSchema.parse(merged);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Config): void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

export function watchConfig(onChange: (config: Config) => void): () => void {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const watcher = watch(configDir, (eventType, filename) => {
    if (filename === 'config.json' && eventType === 'change') {
      onChange(loadConfig());
    }
  });

  return () => {
    watcher.close();
  };
}
