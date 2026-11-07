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
  network: z.object({ partitionPattern: z.string().default('^freebuff-') }).default(() => ({ partitionPattern: '^freebuff-' })),
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
  shadow: z
    .object({
      enabled: z.boolean().default(false),
      dryRun: z.boolean().default(false),
      captureDir: z.string().default(''),
      maxFileBytes: z.number().int().positive().default(8388608),
      maxFiles: z.number().int().min(1).max(20).default(5),
      sampleRate: z.number().min(0).max(1).default(1.0),
      scrubQuery: z.boolean().default(true),
      captureControls: z.boolean().default(true),
      recallFloor: z.number().min(0).max(1).default(0.99),
      precisionFloor: z.number().min(0).max(1).default(1.0),
    })
    .default(() => ({
      enabled: false,
      dryRun: false,
      captureDir: '',
      maxFileBytes: 8388608,
      maxFiles: 5,
      sampleRate: 1.0,
      scrubQuery: true,
      captureControls: true,
      recallFloor: 0.99,
      precisionFloor: 1.0,
    })),
  shield: z
    .object({
      autoHeal: z.boolean().default(false),
      promoteAfter: z.number().default(3),
      rollbackOnFailure: z.boolean().default(true),
      maxPromotedRules: z.number().default(25),
    })
    .default(() => ({ autoHeal: false, promoteAfter: 3, rollbackOnFailure: true, maxPromotedRules: 25 })),
  ghost: z
    .object({
      enabled: z.boolean().default(false),
      preset: z.enum(['standard','aggressive','paranoid']).default('standard'),
    })
    .default(() => ({ enabled: false, preset: 'standard' as const })),
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

export function getConfigDir(profileId?: string): string {
  const base = process.env.FREEBUFF_CONFIG_DIR || join(homedir(), '.config', 'freebuff-ads-remover');
  const profile = profileId || process.env.FREEBUFF_PROFILE;
  if (profile && profile !== 'default') return join(base, 'profiles', profile);
  return base;
}

export function getConfigPath(profileId?: string): string {
  return join(getConfigDir(profileId), 'config.json');
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

export function loadConfig(profileId?: string): Config {
  const configPath = getConfigPath(profileId);

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
    if (merged.preset !== null) {
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

export function saveConfig(config: Config, profileId?: string): void {
  const configDir = getConfigDir(profileId);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(getConfigPath(profileId), JSON.stringify(config, null, 2), 'utf-8');
}

export function watchConfig(onChange: (config: Config) => void, profileId?: string): () => void {
  const configDir = getConfigDir(profileId);
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
