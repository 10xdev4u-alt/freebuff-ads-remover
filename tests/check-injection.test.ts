import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPackageWithOptions } from '@electron/asar';

const script = join(process.cwd(), 'scripts', 'check-injection.mjs');

// Exactly what scripts/patch-freebuff-app.mjs writes.
function loaderLine(entry: string): string {
  return `try{require(${JSON.stringify(entry)});}catch(e){console.error('[freebuff-ads-remover] failed to load:',e&&e.message?e.message:e);}`;
}

let root: string;
let resources: string;

async function buildAsar(main: string): Promise<void> {
  const payload = join(root, 'payload');
  mkdirSync(join(payload, 'electron'), { recursive: true });
  writeFileSync(join(payload, 'package.json'), JSON.stringify({ name: 'fake', main: 'electron/main.cjs' }));
  writeFileSync(join(payload, 'electron', 'main.cjs'), main);
  await createPackageWithOptions(payload, join(resources, 'app.asar'), {});
}

function run(entry: string): number {
  const r = spawnSync(process.execPath, [script, join(resources, 'app.asar')], {
    env: { ...process.env, FREEBUFF_ADS_REMOVER_ENTRY: entry },
    encoding: 'utf8',
  });
  return r.status ?? -1;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'far-inject-'));
  resources = join(root, 'resources');
  mkdirSync(resources, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('check-injection', () => {
  it('accepts a complete loader block', async () => {
    await buildAsar(
      '// freebuff-ads-remover:begin-abcd1234\n' +
        loaderLine('/tmp/extension-entry.js') + '\n' +
        '// freebuff-ads-remover:end\n' +
        'console.log("boot");\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(0);
  });

  it('rejects a begin marker without the matching end marker', async () => {
    await buildAsar('// freebuff-ads-remover:begin-abcd1234\nconsole.log("boot");\n');
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });

  it('rejects an entry require placed outside the loader block', async () => {
    await buildAsar(
      '// freebuff-ads-remover:begin-abcd1234\n' +
        'console.log("boot");\n' +
        '// freebuff-ads-remover:end\n' +
        'try{require("/tmp/extension-entry.js");}catch(e){}\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });

  it('rejects an entry mentioned only in a comment', async () => {
    await buildAsar(
      '// freebuff-ads-remover:begin-abcd1234\n' +
        '// require("/tmp/extension-entry.js")\n' +
        '// freebuff-ads-remover:end\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });

  it('rejects an entry require inside a block comment', async () => {
    await buildAsar(
      '// freebuff-ads-remover:begin-abcd1234\n' +
        '/* require("/tmp/extension-entry.js") */\n' +
        '// freebuff-ads-remover:end\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });

  it('rejects an entry require in a trailing line comment', async () => {
    await buildAsar(
      '// freebuff-ads-remover:begin-abcd1234\n' +
        'console.log("boot"); // require("/tmp/extension-entry.js")\n' +
        '// freebuff-ads-remover:end\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });

  it('rejects a crafted comment pair that hides the require', async () => {
    await buildAsar(
      '// freebuff-ads-remover:begin-abcd1234\n' +
        'console.log("/*"); // */ require("/tmp/extension-entry.js")\n' +
        '// freebuff-ads-remover:end\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });

  it('rejects a writer-format block enclosed in a block comment', async () => {
    await buildAsar(
      '/*\n' +
        '// freebuff-ads-remover:begin-abcd1234\n' +
        loaderLine('/tmp/extension-entry.js') + '\n' +
        '// freebuff-ads-remover:end\n' +
        '*/\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });

  it('rejects a writer-format block after a regex literal containing a quote', async () => {
    await buildAsar(
      'const re = /\'/;\n' +
        '/* \'\n' +
        '// freebuff-ads-remover:begin-abcd1234\n' +
        loaderLine('/tmp/extension-entry.js') + '\n' +
        '// freebuff-ads-remover:end\n' +
        '*/\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });

  it('rejects a loader that requires a different entry', async () => {
    await buildAsar(
      '// freebuff-ads-remover:begin-abcd1234\n' +
        'try{require("/tmp/other-entry.js");}catch(e){console.error(e);}\n' +
        '// freebuff-ads-remover:end\n',
    );
    expect(run('/tmp/extension-entry.js')).toBe(1);
  });
});
