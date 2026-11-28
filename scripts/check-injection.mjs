#!/usr/bin/env node
// Returns 0 if the given app.asar contains a live ads-remover loader block.
// The begin marker alone is not proof: a truncated main.cjs can keep it.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const acorn = require('acorn');
const path = process.argv[2];
const entry = process.env.FREEBUFF_ADS_REMOVER_ENTRY || '';
if (!entry) {
  console.error('FREEBUFF_ADS_REMOVER_ENTRY is required');
  process.exit(1);
}

// Collect real require("<entry>") calls from the parsed AST. Comments, strings
// and regex literals cannot masquerade as calls after parsing.
function requireOffsets(ast, target) {
  const found = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (
      node.type === 'CallExpression'
      && node.callee?.type === 'Identifier'
      && node.callee.name === 'require'
      && node.arguments[0]?.type === 'Literal'
      && node.arguments[0].value === target
    ) found.push(node.start);
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object' && typeof value.type === 'string') walk(value);
    }
  };
  walk(ast);
  return found;
}

try {
  const main = asar.extractFile(path, 'electron/main.cjs').toString();
  const ast = acorn.parse(main, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true });
  const begin = main.indexOf('// freebuff-ads-remover:begin');
  const end = main.indexOf('// freebuff-ads-remover:end', begin + 1);
  const live = begin >= 0 && end > begin
    && requireOffsets(ast, entry).some((offset) => offset > begin && offset < end);
  process.exit(live ? 0 : 1);
} catch {
  process.exit(1);
}
