import fs from 'node:fs';
import { execSync } from 'node:child_process';

let ok = true;
function fail(msg) { console.error('LEDGER FAIL:', msg); ok = false; }

// README test count must match vitest
const readme = fs.readFileSync('README.md', 'utf8');
let testCount = NaN;
try {
  const out = execSync('npx vitest run --reporter=json 2>/dev/null', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
  const json = JSON.parse(out);
  testCount = json.numPassedTests ?? json.testResults?.reduce((a,r)=>a+(r.assertionResults?.filter(x=>x.status==='passed').length||0),0) ?? NaN;
} catch {
  // fallback: parse text
  const out = execSync('npx vitest run 2>&1', { encoding: 'utf8' });
  const m = out.match(/Tests\s+(\d+)\s+passed/);
  if (m) testCount = parseInt(m[1], 10);
}
const m = readme.match(/vitest, (\d+) tests/);
if (isNaN(testCount) || !m || parseInt(m[1], 10) !== testCount) {
  fail(`README test count ${m?.[1]} != actual ${testCount}`);
}

// corpus manifest hash
const corpus = fs.readFileSync('corpus/golden.jsonl');
const crypto = await import('node:crypto');
const hash = crypto.createHash('sha256').update(corpus).digest('hex');
const manifest = JSON.parse(fs.readFileSync('corpus/manifest.json', 'utf8'));
if (hash !== manifest.sha256) fail('corpus manifest hash mismatch');



// Heal receipt verification (optional: only if receipts/ exists)
import { readdirSync } from 'node:fs';
const receiptsDir = 'receipts';
if (fs.existsSync(receiptsDir)) {
  const files = readdirSync(receiptsDir).filter((f) => f.endsWith('.json'));
  if (files.length > 0) {
    // find receipt matching artifact
    const artifact = fs.readFileSync('config/generated-rules.json');
    const artifactHash = 'sha256:' + crypto.createHash('sha256').update(artifact).digest('hex');
    let matched = false;
    for (const f of files) {
      const r = JSON.parse(fs.readFileSync(receiptsDir + '/' + f, 'utf8'));
      if (r.artifactHash === artifactHash) {
        matched = true;
        if (!r.gate?.pass) { fail('heal receipt gate not pass'); }
        const corpusHash = crypto.createHash('sha256').update(fs.readFileSync('corpus/golden.jsonl')).digest('hex');
        if (r.corpusHash !== 'sha256:' + corpusHash) { fail('heal receipt corpus hash mismatch'); }
      }
    }
    if (!matched) fail('no heal receipt matching current artifact');
  }
}

console.log(ok ? 'LEDGER OK' : 'LEDGER FAILED');
process.exit(ok ? 0 : 1);
