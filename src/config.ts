import { readFileSync, writeFileSync, existsSync, mkdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { DEFAULT_CONFIG } from './types.js';

const configSchema = z.object({
  enabled: z.boolean().default(true),
  blockTracking: z.boolean().default(true),
  cssFallback: z.boolean().default(true),
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
    })
    .default(() => ({ ...DEFAULT_CONFIG.surfaces })),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  logToFile: z.boolean().default(true),
});

export type Config = z.infer<typeof configSchema>;

export function getConfigDir(): string {
  return join(homedir(), '.config', 'freebuff-ads-remover');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

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

  return () => watcher.close();
}
