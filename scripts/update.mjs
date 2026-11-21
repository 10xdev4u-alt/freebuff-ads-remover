#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.FREEBUFF_INSTALL_ROOT || (process.env.HOME + '/.local/share/freebuff-ads-remover');
process.chdir(root);

const dist = path.join(root, 'dist');
const backup = path.join(root, 'dist.bak');

console.log('Fetching latest...');
execSync('git fetch --tags --force', { stdio: 'inherit' });
execSync('git pull --ff-only', { stdio: 'inherit' });

console.log('Installing deps...');
execSync('npm ci', { stdio: 'inherit' });

// `npm run build` runs tsc with outDir "dist", so it overwrites the live build
// in place. Copy the current dist aside first so a failed build can be undone.
let hadBackup = false;
if (fs.existsSync(dist)) {
  fs.rmSync(backup, { recursive: true, force: true });
  fs.cpSync(dist, backup, { recursive: true });
  hadBackup = true;
}

try {
  console.log('Building...');
  execSync('npm run build', { stdio: 'inherit' });
  const marker = fs.readFileSync(path.join(dist, 'bootstrap.js'), 'utf8');
  if (!marker.includes('freebuff-ads-remover')) throw new Error('marker missing from dist/bootstrap.js');
} catch (err) {
  if (hadBackup) {
    fs.rmSync(dist, { recursive: true, force: true });
    fs.renameSync(backup, dist);
    console.error('Update failed; previous build restored:', err);
  } else {
    console.error('Update failed and there was no previous build to restore:', err);
  }
  process.exit(1);
}

console.log('Update complete.' + (hadBackup ? ' Previous build kept at dist.bak' : ''));
