import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const GITHUB_REPO = '10xdev4u-alt/freebuff-ads-remover';
const GITHUB_API_BASE = `https://api.github.com/repos/${GITHUB_REPO}`;

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  checkedAt: string;
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag_name: string; html_url: string };
    const latestVersion = data.tag_name.replace(/^v/, '');

    return {
      currentVersion,
      latestVersion,
      updateAvailable: isNewer(latestVersion, currentVersion),
      releaseUrl: data.html_url,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function getCurrentVersion(): string {
  try {
    const pkgPath = join(process.cwd(), 'package.json');
    if (!existsSync(pkgPath)) {
      return '0.0.0';
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function isNewer(latest: string, current: string): boolean {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const l = latestParts[i] ?? 0;
    const c = currentParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}
