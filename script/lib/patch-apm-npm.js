'use strict';

/**
 * apm bundles npm 6, which crashes in update-package-json.js when a package
 * that requires a module lists it in devDependencies but has no dependencies
 * field at all ("Cannot read property '<name>' of undefined", npm/npm#19877).
 * Several atom org git deps hit this (e.g. packages devDep'ing `standard`).
 *
 * Guard the lookup with a default object. Idempotent.
 * Usage: node script/lib/patch-apm-npm.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(
  process.argv[2] || path.join(__dirname, '..', '..')
);
const target = path.join(
  repoRoot,
  'apm',
  'node_modules',
  'atom-package-manager',
  'node_modules',
  'npm',
  'lib',
  'install',
  'update-package-json.js'
);

const BROKEN = '!req.package.dependencies[name]';
const FIXED = '!(req.package.dependencies || {})[name]';

if (!fs.existsSync(target)) {
  console.log('patch-apm-npm: npm not installed yet, skipping');
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');
if (source.includes(FIXED)) {
  console.log('patch-apm-npm: already patched');
} else if (source.includes(BROKEN)) {
  fs.writeFileSync(target, source.replace(BROKEN, FIXED));
  console.log('patch-apm-npm: patched update-package-json.js');
} else {
  console.warn('patch-apm-npm: expected pattern not found — npm changed?');
}
