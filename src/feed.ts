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

export function signManifest(manifest: Omit<FeedManifest, 'sig'>, privateKeyPem: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  const signature = crypto.sign(null, Buffer.from(canonicalManifest(manifest)), key);
  return signature.toString('base64');
}

export function verifyManifest(manifest: FeedManifest, publicKeyPem: string): boolean {
  if (typeof manifest.sig !== 'string') return false;
  const { sig, ...rest } = manifest;
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(null, Buffer.from(canonicalManifest(rest)), key, Buffer.from(sig, 'base64'));
  } catch {
    return false;
  }
}

export function keyHash(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
