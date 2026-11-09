import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config.js';

export function installIdPath(): string {
  return path.join(getConfigDir(), 'install-id');
}

export function getInstallId(): string {
  const p = installIdPath();
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  } catch { /* fall through */ }
  const id = crypto.randomBytes(16).toString('hex');
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, id);
  } catch { /* fail open */ }
  return id;
}

export function hashedInstallId(salt: string): string {
  return crypto.createHash('sha256').update(getInstallId() + ':' + salt).digest('hex');
}
