'use strict';

const fs = require('fs');
const path = require('path');

// Resolved on first use, not at require time: __dirname moves when the package
// is bundled into a single index.js at the package root, and the package
// manager knows where the package is whatever the layout.
let recoveredDir = null;

function getRecoveredDir() {
  if (recoveredDir) return recoveredDir;
  // No __dirname fallback on purpose. This module only runs inside the editor,
  // and a fallback derived from the calling file's position is precisely the
  // thing that breaks once the package is bundled -- it would work in dev and
  // silently read from the wrong place in a shipped build.
  // resolvePackagePath, not helpers.getPackageRoot: these .graphql files are
  // read with fs.readFileSync, which Electron patches to read straight out of
  // the asar. getPackageRoot deliberately remaps into app.asar.unpacked for
  // files handed to another process, and graphql/ is not unpacked -- pointing
  // there would look for files that are not on disk.
  const root = chevron.packages.resolvePackagePath('github');
  if (!root) {
    throw new Error('github: cannot locate the package to load recovered queries');
  }
  recoveredDir = path.join(root, 'graphql', 'recovered');
  return recoveredDir;
}

function loadRecovered(name) {
  return fs.readFileSync(path.join(getRecoveredDir(), name + '.graphql'), 'utf8');
}

module.exports = {loadRecovered};
