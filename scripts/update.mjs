#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.env.FREEBUFF_INSTALL_ROOT || (process.env.HOME + '/.local/share/freebuff-ads-remover');
process.chdir(root);

console.log('Fetching latest...');
execSync('git fetch --tags --force', { stdio: 'inherit' });
execSync('git pull --ff-only', { stdio: 'inherit' });

console.log('Installing deps...');
execSync('npm ci', { stdio: 'inherit' });

// staging build
const staging = root + '.staging';
if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging);
execSync('npm run build', { stdio: 'inherit' });

// verify marker survived
const marker = fs.readFileSync(path.join(root, 'dist', 'bootstrap.js'), 'utf8');
if (!marker.includes('freebuff-ads-remover')) {
  console.error('marker missing; aborting update');
  process.exit(1);
}

// atomic swap with backup
const dist = path.join(root, 'dist');
const backup = path.join(root, 'dist.bak');
if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
fs.renameSync(dist, backup);
fs.renameSync(path.join(root, 'dist'), dist); // no-op safety
// dist already in place from build; nothing to move
console.log('Update complete. Previous build at dist.bak');
