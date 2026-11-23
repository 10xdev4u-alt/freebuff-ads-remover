#!/usr/bin/env node
// Emits an SPDX 2.3 SBOM for the release bundle's npm dependencies.
//
// The document is deterministic: the creation timestamp defaults to the Unix
// epoch and the namespace is derived from the package version, so the same
// lockfile always produces the same bytes. Pass `--created <iso>` (the release
// job uses the tagged commit's date) when a real timestamp is wanted.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const out = arg('out', 'sbom.spdx.json');
const created = arg('created', '1970-01-01T00:00:00Z');
const commit = arg('commit', '');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const lockPackages = lock.packages ?? {};

function licenseOf(entry) {
  const value = entry.license ?? entry.licenses;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : v.type)).join(' AND ');
  if (value && typeof value.type === 'string') return value.type;
  return 'NOASSERTION';
}

function purlOf(name, version) {
  return `pkg:npm/${name}@${version}`;
}

function downloadOf(entry) {
  if (entry.link) return 'NONE';
  return typeof entry.resolved === 'string' && entry.resolved ? entry.resolved : 'NOASSERTION';
}

const dependencyEntries = Object.entries(lockPackages)
  .filter(([key]) => key !== '' && key.includes('node_modules/'))
  .map(([key, entry]) => {
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    return { name, version: entry.version ?? 'NOASSERTION', entry };
  })
  .filter((d) => d.version !== 'NOASSERTION')
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const rootId = 'SPDXRef-Package-root';
const dependencyIds = new Map(dependencyEntries.map((d, i) => [d, `SPDXRef-Package-${i}`]));

const packages = [
  {
    SPDXID: rootId,
    name: pkg.name,
    versionInfo: pkg.version,
    downloadLocation: 'NONE',
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: pkg.license ?? 'NOASSERTION',
    copyrightText: 'NOASSERTION',
    externalRefs: [
      { referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: purlOf(pkg.name, pkg.version) },
    ],
  },
  ...dependencyEntries.map((d) => ({
    SPDXID: dependencyIds.get(d),
    name: d.name,
    versionInfo: d.version,
    downloadLocation: downloadOf(d.entry),
    filesAnalyzed: false,
    licenseConcluded: 'NOASSERTION',
    licenseDeclared: licenseOf(d.entry),
    copyrightText: 'NOASSERTION',
    externalRefs: [
      { referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: purlOf(d.name, d.version) },
    ],
  })),
];

const relationships = [
  { spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: rootId },
  ...dependencyEntries.map((d) => ({
    spdxElementId: rootId,
    relationshipType: 'DEPENDS_ON',
    relatedSpdxElement: dependencyIds.get(d),
  })),
];

const document = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: 'SPDXRef-DOCUMENT',
  name: `${pkg.name}-${pkg.version}`,
  documentNamespace: `https://spdx.org/spdxdocs/${pkg.name}-${pkg.version}${commit ? `-${commit}` : ''}`,
  creationInfo: {
    created,
    creators: ['Tool: gen-sbom.mjs'],
  },
  packages,
  relationships,
};

writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(`[sbom] wrote ${out} (${dependencyEntries.length} dependencies)`);
