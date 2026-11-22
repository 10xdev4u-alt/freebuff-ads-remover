#!/usr/bin/env node
import { checkLedger } from './ledger-check.mjs';

const root = process.cwd();
const { ok, findings, warnings } = await checkLedger(root);
for (const w of warnings) console.error('LEDGER WARN:', w);
for (const f of findings) console.error('LEDGER FAIL:', f);
console.log(ok ? 'LEDGER OK' : 'LEDGER FAILED');
process.exit(ok ? 0 : 1);
