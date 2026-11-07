import fs from 'node:fs';
import path from 'node:path';

export function discoverPartitions(userDataDir: string, pattern: RegExp): string[] {
  const partitionsDir = path.join(userDataDir, 'Partitions');
  if (!fs.existsSync(partitionsDir)) return [];
  const names: string[] = [];
  for (const entry of fs.readdirSync(partitionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (pattern.test(entry.name)) names.push('persist:' + entry.name);
  }
  return names;
}
