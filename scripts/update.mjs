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

// atomic swap with backup: build into staging/dist, then swap
const dist = path.join(root, 'dist');
const stagingDist = path.join(staging, 'dist');
const backup = path.join(root, 'dist.bak');
// move the freshly built dist into staging for verification
if (fs.existsSync(stagingDist)) fs.rmSync(stagingDist, { recursive: true, force: true });
fs.renameSync(dist, stagingDist);
// verify marker
const marker = fs.readFileSync(path.join(stagingDist, 'bootstrap.js'), 'utf8');
if (!marker.includes('freebuff-ads-remover')) { console.error('marker missing'); process.exit(1); }
// swap
if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
fs.renameSync(dist, backup).catch && null;
// dist may not exist now (moved); ensure
fs.renameSync(stagingDist, dist);
console.log('Update complete. Previous build at dist.bak');
