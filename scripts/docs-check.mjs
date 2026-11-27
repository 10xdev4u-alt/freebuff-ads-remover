#!/usr/bin/env node
// Verifies human-facing documentation against the code it describes. Mirrors
// the ledger gate: pure checkDocs(), injectable sources of truth, CLI fail-closed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function read(root, rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return '';
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function defaultDeps(root) {
  const config = read(root, 'src/config.ts');
  const types = read(root, 'src/types.ts');
  const surfacesBlock = /surfaces:\s*\{([\s\S]*?)\}/.exec(types)?.[1] ?? '';
  const surfaces = [...surfacesBlock.matchAll(/^\s*(\w+):\s*(?:true|false)/gm)].map((m) => m[1]);
  let payloadVersion = '';
  try {
    payloadVersion = JSON.parse(read(root, 'config/endpoint-baseline.json')).payloadVersion ?? '';
  } catch { /* fail closed via the version check */ }
  return {
    defaults: {
      promoteAfter: Number(/promoteAfter:\s*z\.number\(\)\.default\((\d+)\)/.exec(config)?.[1]),
      maxPromotedRules: Number(/maxPromotedRules:\s*z\.number\(\)\.default\((\d+)\)/.exec(config)?.[1]),
      surfaces,
    },
    payloadVersion,
  };
}

/**
 * Checks the documentation claims that have repeatedly drifted from code.
 * `deps` supplies the source of truth so tests can break one claim at a time.
 */
export async function checkDocs(root, deps = defaultDeps(root)) {
  const findings = [];
  const warnings = [];
  const fail = (message) => findings.push(message);
  const { promoteAfter, maxPromotedRules, surfaces } = deps.defaults;
  const payloadVersion = deps.payloadVersion;

  const configuration = read(root, 'docs/CONFIGURATION.md');
  for (const [field, expected] of [
    ['promoteAfter', promoteAfter],
    ['maxPromotedRules', maxPromotedRules],
  ]) {
    const match = new RegExp(`${field}` + '` \\(number, default (\\d+)\\)').exec(configuration);
    if (!match) fail(`CONFIGURATION.md shield.${field} default not found`);
    else if (Number(match[1]) !== expected) {
      fail(`CONFIGURATION.md shield.${field} default ${match[1]} != code ${expected}`);
    }
  }

  const roadmap = read(root, 'ROADMAP.md');
  const header = /^## Deprecated ([^\n]*)$/m.exec(roadmap);
  if (!header) fail('ROADMAP Deprecated header not found');
  else if (!header[1].includes(payloadVersion)) {
    fail(`ROADMAP Deprecated header missing current payload ${payloadVersion}`);
  }

  // Section 8 quotes the coverage figures in prose. index.html pins lines and
  // branches to values the ledger verifies against a real coverage run, so the
  // prose must agree with those pins. Functions/statements have no checked-in
  // pin and remain manually maintained.
  const claim = /the suite holds (\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)/.exec(roadmap);
  if (!claim) {
    fail('ROADMAP coverage claim not found');
  } else {
    const landing = read(root, 'index.html');
    const linePin = /coverage (\d+(?:\.\d+)?)% lines/.exec(landing)?.[1];
    const obj = /coverage:\{lines:(\d+(?:\.\d+)?),branches:(\d+(?:\.\d+)?)\}/.exec(landing);
    if (!linePin) fail('landing coverage text not found');
    else if (claim[1] !== linePin) fail(`ROADMAP coverage lines ${claim[1]} != index ${linePin}`);
    if (!obj) fail('landing coverage object not found');
    else if (claim[3] !== obj[2]) fail(`ROADMAP coverage branches ${claim[3]} != index ${obj[2]}`);
  }

  const template = read(root, '.github/pull_request_template.md');
  if (!/^- \[[ x]\].*audit/im.test(template)) fail('PR template has no audit checkbox');

  const architecture = read(root, 'docs/ARCHITECTURE.md');
  let documented = null;
  for (const block of architecture.matchAll(/```json\s*([\s\S]*?)```/g)) {
    try {
      const parsed = JSON.parse(block[1]);
      if (parsed?.surfaces && typeof parsed.surfaces === 'object') {
        documented = parsed.surfaces;
        break;
      }
    } catch { /* skip prose blocks */ }
  }
  if (!documented) {
    fail('ARCHITECTURE.md surfaces block not found');
  } else {
    for (const surface of surfaces) {
      if (!(surface in documented)) fail(`ARCHITECTURE.md surfaces missing ${surface}`);
    }
    for (const extra of Object.keys(documented)) {
      if (!surfaces.includes(extra)) warnings.push(`ARCHITECTURE.md surfaces has undocumented ${extra}`);
    }
  }

  if (!Number.isFinite(promoteAfter) || !Number.isFinite(maxPromotedRules)) {
    fail('code shield defaults could not be resolved');
  }
  if (surfaces.length === 0) fail('code default surfaces could not be resolved');

  return { ok: findings.length === 0, findings, warnings };
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invoked === import.meta.url) {
  const root = process.cwd();
  const result = await checkDocs(root);
  for (const finding of result.findings) process.stderr.write(`DOCS FAIL: ${finding}\n`);
  for (const warning of result.warnings) process.stderr.write(`DOCS WARN: ${warning}\n`);
  process.exit(result.ok ? 0 : 1);
}
