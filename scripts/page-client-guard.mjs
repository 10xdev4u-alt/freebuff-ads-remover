#!/usr/bin/env node
// Guard for dist/dashboard-client.js, which is evaluated verbatim inside the
// Freebuff page via webContents.executeJavaScript.
//
// The previous check was a line filter plus three regexes. That missed syntax
// the page would still choke on (for example `const x = require('fs')` written
// across lines, or an emitted `export {}`), and a build whose tsc output never
// contained the client passed silently. This module parses the emitted file
// with the TypeScript AST, removes only the one CommonJS marker tsc emits,
// rejects any surviving `exports`/`module`/`require` reference or
// import/export declaration, and smoke-tests the result in a bare vm context
// that has none of those globals.

import vm from 'node:vm';
import ts from 'typescript';

const FORBIDDEN_IDENTIFIERS = new Set(['exports', 'module', 'require']);

function parse(source) {
  return ts.createSourceFile('dashboard-client.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
}

function parseFindings(sf) {
  const findings = [];
  for (const diagnostic of sf.parseDiagnostics ?? []) {
    findings.push(`parse error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }
  return findings;
}

/** The one CommonJS statement tsc is allowed to emit for this type-only module. */
function findMarkerRanges(sf) {
  const ranges = [];
  const visit = (node) => {
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      const target = call.expression;
      if (
        ts.isPropertyAccessExpression(target) &&
        ts.isIdentifier(target.expression) &&
        target.expression.text === 'Object' &&
        target.name.text === 'defineProperty' &&
        call.arguments.length >= 2 &&
        ts.isIdentifier(call.arguments[0]) &&
        call.arguments[0].text === 'exports' &&
        ts.isStringLiteral(call.arguments[1]) &&
        call.arguments[1].text === '__esModule'
      ) {
        ranges.push({ start: node.getStart(sf), end: node.getEnd() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return ranges;
}

function removeRanges(source, ranges) {
  let out = source;
  for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
    let end = range.end;
    if (out[end] === '\r' && out[end + 1] === '\n') end += 2;
    else if (out[end] === '\n') end += 1;
    out = out.slice(0, range.start) + out.slice(end);
  }
  return out;
}

/** `foo.exports`, `{ exports: 1 }` and class members are not free references. */
function isPropertyName(id) {
  const parent = id.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent)) return parent.name === id;
  if (ts.isPropertyAssignment(parent)) return parent.name === id;
  if (ts.isPropertyDeclaration(parent)) return parent.name === id;
  if (ts.isMethodDeclaration(parent)) return parent.name === id;
  if (ts.isGetAccessorDeclaration(parent)) return parent.name === id;
  if (ts.isSetAccessorDeclaration(parent)) return parent.name === id;
  return false;
}

function hasExportModifier(node) {
  if (!ts.canHaveModifiers?.(node)) return false;
  const modifiers = ts.getModifiers(node) ?? [];
  return modifiers.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword || modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );
}

function collectForbidden(sf) {
  const found = new Set();
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) found.add('import declaration');
    if (ts.isExportDeclaration(node) || ts.isExportAssignment(node) || hasExportModifier(node)) found.add('export declaration');
    if (ts.isIdentifier(node) && FORBIDDEN_IDENTIFIERS.has(node.text) && !isPropertyName(node)) {
      found.add(`\`${node.text}\` reference`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...found];
}

/**
 * Removes the tolerated tsc marker and returns every surviving page-unsafe
 * construct. `findings` is empty only when the code is safe to evaluate as a
 * classic script.
 */
export function sanitizePageClient(source) {
  if (typeof source !== 'string' || source.trim() === '') {
    return { code: typeof source === 'string' ? source : '', findings: ['dashboard-client.js is empty'], markersRemoved: 0 };
  }

  const original = parse(source);
  const findings = parseFindings(original);
  if (findings.length > 0) return { code: source, findings, markersRemoved: 0 };

  const ranges = findMarkerRanges(original);
  const markersRemoved = ranges.length;
  const code = removeRanges(source, ranges);

  const sanitized = parse(code);
  findings.push(...parseFindings(sanitized).map((f) => f.replace('parse error:', 'parse error after sanitizing:')));
  findings.push(...collectForbidden(sanitized).map((f) => `page-unsafe syntax survives: ${f}`));
  return { code, findings, markersRemoved };
}

/** Evaluates the code exactly as the page would: no module system globals. */
export function smokeTestPageClient(code) {
  const sandbox = {};
  try {
    vm.runInNewContext(code, sandbox, { timeout: 5000 });
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
  const api = sandbox.farBuffShield;
  const complete =
    api &&
    typeof api.install === 'function' &&
    typeof api.update === 'function' &&
    typeof api.unmount === 'function' &&
    typeof api.isOpen === 'function';
  if (!complete) return { ok: false, error: 'farBuffShield api missing or incomplete' };
  return { ok: true };
}
