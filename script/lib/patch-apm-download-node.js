#!/usr/bin/env node
'use strict';

/**
 * apm bundles Node 12, which has no official darwin-arm64 build.
 * On Apple Silicon, force download of darwin-x64 Node and treat it as
 * valid (Rosetta runs the binary). Idempotent.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = process.argv[2] || path.resolve(__dirname, '..', '..');
const downloadNodePath = path.join(
  repoRoot,
  'apm',
  'node_modules',
  'atom-package-manager',
  'script',
  'download-node.js'
);

if (!fs.existsSync(downloadNodePath)) {
  console.log('patch-apm-download-node: skip (apm not installed yet)');
  process.exit(0);
}

const MARKER = 'chevron-darwin-arm64-x64';
const LEGACY_MARKER = 'atomnova-darwin-arm64-x64';
let text = fs.readFileSync(downloadNodePath, 'utf8');
if (text.includes(MARKER) || text.includes(LEGACY_MARKER)) {
  console.log('patch-apm-download-node: already applied');
  process.exit(0);
}

const oldIdentify = `var identifyArch = function() {
  switch (process.arch) {
    case "ia32":  return "x86";
    case "arm":   return "armv" + process.config.variables.arm_version + "l";
    default:      return process.arch;
  }
};`;

const newIdentify = `var identifyArch = function() {
  // ${MARKER}: Node 12 has no darwin-arm64 dist; use x64 under Rosetta.
  if (process.platform === 'darwin' && process.arch === 'arm64') {
    return 'x64';
  }
  switch (process.arch) {
    case "ia32":  return "x86";
    case "arm":   return "armv" + process.config.variables.arm_version + "l";
    default:      return process.arch;
  }
};`;

if (!text.includes(oldIdentify)) {
  console.error(
    'patch-apm-download-node: unexpected download-node.js contents; refusing to patch'
  );
  process.exit(1);
}

text = text.replace(oldIdentify, newIdentify);

// Accept installed x64 binary on arm64 host (Rosetta).
text = text.replace(
  'installedArch !== process.arch',
  `installedArch !== process.arch &&
          !(process.platform === 'darwin' && process.arch === 'arm64' && installedArch === 'x64')`
);

fs.writeFileSync(downloadNodePath, text);
console.log('patch-apm-download-node: patched for darwin-arm64 -> x64 Node 12');
