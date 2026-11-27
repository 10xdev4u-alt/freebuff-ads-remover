import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { applyVersionBump } from '../scripts/bump-version.mjs';

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-version-'));
  const write = (rel: string, content: string) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  write('package.json', JSON.stringify({ name: 'x', version: '1.27.0' }, null, 2) + '\n');
  write(
    'README.md',
    '# Title\n\n[![Version: 1.27.0](https://img.shields.io/badge/version-1.27.0-blue)](CHANGELOG.md)\n\nbody\n',
  );
  write(
    'CHANGELOG.md',
    '# Changelog\n\nIntro line.\n\n## [1.27.0] - 2026-11-19\n\nWave 54 notes.\n\n## [1.26.0] - 2026-11-18\n\nolder\n',
  );
  write(
    'index.html',
    [
      '<nav><span class="ver-pill">v1.27.0</span></nav>',
      '<span class="eyebrow"><span class="dot"></span> v1.27.0 · verified against Freebuff 0.0.205</span>',
      `const receiptJson = { extensionVersion:'1.27.0', hash:'sha256:${'a'.repeat(64)}' };`,
      '<span class="line" data-l="✓ verified against Freebuff 0.0.205">✓ verified against Freebuff 0.0.205</span>',
      '<p>untouched</p>',
    ].join('\n'),
  );
  return root;
}

const roots: string[] = [];
afterEach(() => { while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true }); });
function fixture() { const r = makeFixture(); roots.push(r); return r; }

const base = {
  version: '1.28.0',
  payloadVersion: '0.0.205',
  artifactHash: 'sha256:' + 'a'.repeat(64),
  receiptFile: 'receipts/live-0.0.205.json',
  receiptAt: '2026-11-23T16:57:11.153Z',
  notes: 'Wave 61: auto-cut from a verified live receipt.',
  date: '2026-11-24',
};

describe('applyVersionBump', () => {
  it('updates every version surface and writes the cut marker', () => {
    const root = fixture();
    const result = applyVersionBump(root, base);
    expect(result.files.sort()).toEqual(['CHANGELOG.md', 'README.md', 'index.html', 'package.json', 'release/last-cut.json']);
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
    expect(pkg.version).toBe('1.28.0');
    expect(fs.readFileSync(path.join(root, 'README.md'), 'utf8')).toContain('version-1.28.0-blue');
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain('## [1.28.0] - 2026-11-24');
    expect(changelog.indexOf('## [1.28.0]')).toBeLessThan(changelog.indexOf('## [1.27.0]'));
    expect(changelog).toMatch(/Wave 61: auto-cut[^\n]*\n\n## \[1\.27\.0\]/);
    expect(changelog).not.toContain('notes\n## [1.27.0]');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toContain('class="ver-pill">v1.28.0<');
    expect(html).toContain('v1.28.0 · verified against Freebuff 0.0.205');
    expect(html).toContain(`extensionVersion:'1.28.0'`);
    expect(html).toContain(`hash:'${base.artifactHash}'`);
    expect(html).toContain('<p>untouched</p>');
    expect(JSON.parse(fs.readFileSync(path.join(root, 'release/last-cut.json'), 'utf8'))).toEqual({
      version: '1.28.0',
      payloadVersion: '0.0.205',
      artifactHash: base.artifactHash,
      receipt: 'receipts/live-0.0.205.json',
      at: '2026-11-23T16:57:11.153Z',
    });
  });

  it('keeps unrelated file content intact', () => {
    const root = fixture();
    applyVersionBump(root, base);
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    expect(readme).toContain('# Title');
    expect(readme).toContain('body');
    expect(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')).toContain('Wave 54 notes.');
  });

  it('leaves every file untouched when any expected token is missing', () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'README.md'), '# no badge here\n');
    const before = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
    expect(() => applyVersionBump(root, base)).toThrow(/README/);
    expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(root, 'release/last-cut.json'))).toBe(false);
  });

  it('refreshes every verified-against string when the payload version changes', () => {
    const root = fixture();
    applyVersionBump(root, { ...base, payloadVersion: '0.0.206' });
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toContain('v1.28.0 · verified against Freebuff 0.0.206');
    expect(html).toContain(
      '<span class="line" data-l="✓ verified against Freebuff 0.0.206">✓ verified against Freebuff 0.0.206</span>',
    );
    expect(html).not.toMatch(/verified against Freebuff 0\.0\.205/);
    expect(html.match(/verified against Freebuff 0\.0\.206/g)).toHaveLength(3);
    expect(html).toContain('<p>untouched</p>');
  });

  it('leaves verified-against strings alone when the payload version is unchanged', () => {
    const root = fixture();
    applyVersionBump(root, base);
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toContain('v1.28.0 · verified against Freebuff 0.0.205');
    expect(html).toContain(
      '<span class="line" data-l="✓ verified against Freebuff 0.0.205">✓ verified against Freebuff 0.0.205</span>',
    );
    expect(html).not.toMatch(/verified against Freebuff 0\.0\.206/);
    expect(html.match(/verified against Freebuff 0\.0\.205/g)).toHaveLength(3);
  });

  it('rejects a non-semver target version', () => {
    const root = fixture();
    expect(() => applyVersionBump(root, { ...base, version: '1.28' })).toThrow(/semver/i);
  });

  it('rejects an invalid payload version', () => {
    const root = fixture();
    expect(() => applyVersionBump(root, { ...base, payloadVersion: 'latest' })).toThrow(/payload/i);
  });
});
