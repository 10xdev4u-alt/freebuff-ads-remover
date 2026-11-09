import crypto from 'node:crypto';

export interface FeedRuleDelta {
  addEndpoints?: string[];
  addSelectors?: Record<string, string[]>;
  source?: string;
}

export interface FeedEntry {
  healHash: string;
  rules: FeedRuleDelta;
  route?: string;
}

export interface FeedManifest {
  version: number;
  generatedAt?: string;
  entries: FeedEntry[];
  rollbackTo?: string | null;
  sig: string;
}

export function canonicalManifest(manifest: Omit<FeedManifest, 'sig'>): string {
  return JSON.stringify(manifest, Object.keys(manifest).sort());
}

export function signManifest(manifest: Omit<FeedManifest, 'sig'>, key: string): string {
  return crypto.createHmac('sha256', key).update(canonicalManifest(manifest)).digest('hex');
}

export function verifyManifest(manifest: FeedManifest, key: string): boolean {
  if (typeof manifest.sig !== 'string') return false;
  const { sig, ...rest } = manifest;
  const expected = signManifest(rest, key);
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export function keyHash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
