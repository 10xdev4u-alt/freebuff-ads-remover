#!/usr/bin/env node
// Verifies that the checked-in audit artifacts agree with each other, without
// needing a Freebuff payload.
//
// scripts/audit-endpoints.mjs compares the routes it discovers in a payload
// against config/endpoint-baseline.json, so the baseline is the reference side
// of every future delta signal. A PR can silence that signal by hand-editing
// the baseline, and config/generated-rules.json is applied verbatim at runtime
// (src/bootstrap.ts). Neither file is checked against its own invariants in a
// pull_request run today. This gate fails on either drift.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadDefaults() {
  try {
    return {
      verifyDelta: require('../dist/delta-gate.js').verifyDelta,
      classifyRoute: require('../dist/candidates.js').classifyRoute,
      RuleRegistry: require('../dist/rule-registry.js').RuleRegistry,
    };
  } catch {
    // The CI job builds first; tests inject these from src/.
    return {};
  }
}

const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

function isRuleDelta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!isStringArray(value.addEndpoints)) return false;
  if ('addHosts' in value && !isStringArray(value.addHosts)) return false;
  if (!value.addSelectors || typeof value.addSelectors !== 'object' || Array.isArray(value.addSelectors)) return false;
  if (!Object.values(value.addSelectors).every(isStringArray)) return false;
  return typeof value.source === 'string';
}

/** Classification comparison that ignores key order but not values. */
function sameClassification(stored, actual) {
  if (!stored || !actual) return false;
  const sig = (x) =>
    `${x.candidate ? 1 : 0}|${Number(x.confidence)}|${[...(Array.isArray(x.signals) ? x.signals : [])].join(',')}`;
  return sig(stored) === sig(actual);
}

function readJson(root, rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return { ok: false, error: `${rel} is missing` };
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { ok: false, error: `${rel} is not valid JSON: ${error.message}` };
  }
}

export function checkAuditDeltas(root, deps = {}) {
  const findings = [];
  const d = { ...loadDefaults(), ...deps };

  // 1. The shipped delta must be a well-formed RuleDelta that passes the gate.
  const deltaFile = readJson(root, 'config/generated-rules.json');
  let delta = null;
  if (!deltaFile.ok) {
    findings.push(deltaFile.error);
  } else if (!isRuleDelta(deltaFile.value)) {
    findings.push('config/generated-rules.json is not a valid rule delta (need addEndpoints, addSelectors, source)');
  } else {
    delta = deltaFile.value;
  }

  if (delta) {
    if (typeof d.verifyDelta !== 'function' || typeof d.RuleRegistry !== 'function') {
      findings.push('delta gate unavailable: build dist/ or inject verifyDelta and RuleRegistry');
    } else {
      try {
        const gate = d.verifyDelta(delta, new d.RuleRegistry(), path.join(root, 'corpus'));
        if (!gate.pass) {
          findings.push(
            `generated-rules delta rejected (${gate.reason ?? 'gate'}): recall=${gate.recall} precision=${gate.precision} missed=[${gate.missed.join(',')}] fps=[${gate.fps.join(',')}]`,
          );
        }
      } catch (error) {
        findings.push(`delta gate failed to run: ${error.message}`);
      }
    }
  }

  // 2. The baseline must reproduce the shipped classifier for every route.
  const baselineFile = readJson(root, 'config/endpoint-baseline.json');
  if (!baselineFile.ok) {
    findings.push(baselineFile.error);
  } else {
    const b = baselineFile.value;
    const routes = b.routes;
    const classifications = b.classifications;
    if (!isStringArray(routes)) findings.push('config/endpoint-baseline.json has no string routes array');
    if (!classifications || typeof classifications !== 'object' || Array.isArray(classifications)) {
      findings.push('config/endpoint-baseline.json has no classifications object');
    }
    if (isStringArray(routes) && classifications && typeof classifications === 'object' && !Array.isArray(classifications)) {
      if (typeof d.classifyRoute !== 'function') {
        findings.push('classifier unavailable: build dist/ or inject classifyRoute');
      } else {
        const seen = new Set();
        for (const route of routes) {
          if (seen.has(route)) findings.push(`baseline repeats route: ${route}`);
          seen.add(route);
          if (!Object.hasOwn(classifications, route)) {
            findings.push(`baseline route without classification: ${route}`);
            continue;
          }
          try {
            if (!sameClassification(classifications[route], d.classifyRoute(route))) {
              findings.push(`baseline classification drift: ${route}`);
            }
          } catch (error) {
            findings.push(`baseline classification could not be recomputed for ${route}: ${error.message}`);
          }
        }
        for (const route of Object.keys(classifications)) {
          if (!seen.has(route)) findings.push(`baseline classification without route: ${route}`);
        }
      }
    }
  }

  return { ok: findings.length === 0, findings };
}
