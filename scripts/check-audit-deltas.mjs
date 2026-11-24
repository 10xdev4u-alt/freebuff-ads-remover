#!/usr/bin/env node
import { checkAuditDeltas } from './audit-delta-check.mjs';

const root = process.cwd();
const { ok, findings } = await checkAuditDeltas(root);
for (const f of findings) console.error('AUDIT DELTA FAIL:', f);
console.log(ok ? 'AUDIT DELTAS OK' : 'AUDIT DELTAS FAILED');
process.exit(ok ? 0 : 1);
