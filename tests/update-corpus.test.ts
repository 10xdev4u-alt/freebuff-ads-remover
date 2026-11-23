import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const repo = process.cwd();
const script = path.join(repo, 'scripts', 'update-corpus.mjs');

beforeAll(() => {
  if (
    !fs.existsSync(path.join(repo, 'dist', 'candidates.js')) ||
    !fs.existsSync(path.join(repo, 'dist', 'surface.js'))
  ) {
    execFileSync('npm', ['run', 'build'], { cwd: repo, stdio: 'inherit' });
  }
});

describe('update-corpus', () => {
  it('preserves controls and source tags from earlier runs', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'far-corpus-'));
    try {
      fs.mkdirSync(path.join(project, 'corpus'), { recursive: true });
      const golden = [
        { path: '/api/ad/known', label: 'ad', surface: 'sponsorBreak', source: 'upstream-audit@0.0.201' },
        { path: '/healthz', label: 'control', surface: null, source: 'upstream-audit@0.0.201' },
        { path: '/custom/control', label: 'control', surface: null, source: 'manual@2026-01-01' },
        { path: '/api/ad/control', label: 'control', surface: null, source: 'manual@2026-01-01' },
      ];
      fs.writeFileSync(
        path.join(project, 'corpus', 'golden.jsonl'),
        golden.map((e) => JSON.stringify(e)).join('\n') + '\n',
      );
      const resources = path.join(project, 'resources');
      fs.mkdirSync(resources, { recursive: true });
      fs.writeFileSync(
        path.join(resources, 'app.js'),
        'const x = "/api/ad/new";\nconst y = "/api/ad/control";\n',
      );

      const out = path.join(project, 'out', 'golden.jsonl');
      const manifest = path.join(project, 'out', 'manifest.json');
      const r = spawnSync(
        process.execPath,
        [script, '--resources', resources, '--out', out, '--manifest', manifest, '--version', '0.0.204'],
        { cwd: project, encoding: 'utf8' },
      );
      expect(r.status).toBe(0);

      const entries = fs
        .readFileSync(out, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { path: string; label: string; source: string });
      const custom = entries.find((e) => e.path === '/custom/control');
      expect(custom).toBeDefined();
      expect(custom?.source).toBe('manual@2026-01-01');
      const known = entries.find((e) => e.path === '/api/ad/known');
      expect(known?.source).toBe('upstream-audit@0.0.201');
      expect(entries.some((e) => e.path === '/api/ad/new')).toBe(true);
      // A retained control that looks ad-shaped must stay a control only.
      expect(entries.filter((e) => e.path === '/api/ad/control').map((e) => e.label)).toEqual(['control']);
      // Atomic writes must not leave temp files behind.
      expect(fs.existsSync(out + '.tmp')).toBe(false);
      expect(fs.existsSync(manifest + '.tmp')).toBe(false);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });
});
