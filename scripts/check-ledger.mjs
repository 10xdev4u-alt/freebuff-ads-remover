import fs from 'node:fs';
import { execSync } from 'node:child_process';

let ok = true;
function fail(msg) { console.error('LEDGER FAIL:', msg); ok = false; }

// README test count must match vitest
const readme = fs.readFileSync('README.md', 'utf8');
const testCount = parseInt(execSync("npx vitest run 2>&1 | grep -E 'Tests[ ]+[0-9]+ passed' | grep -oE '[0-9]+' | head -1", { encoding: 'utf8' }).trim(), 10);
const m = readme.match(/vitest, (\d+) tests/);
if (!m || parseInt(m[1], 10) !== testCount) {
  fail(`README test count ${m?.[1]} != actual ${testCount}`);
}

// corpus manifest hash
const corpus = fs.readFileSync('corpus/golden.jsonl');
const crypto = await import('node:crypto');
const hash = crypto.createHash('sha256').update(corpus).digest('hex');
const manifest = JSON.parse(fs.readFileSync('corpus/manifest.json', 'utf8'));
if (hash !== manifest.sha256) fail('corpus manifest hash mismatch');

console.log(ok ? 'LEDGER OK' : 'LEDGER FAILED');
process.exit(ok ? 0 : 1);
