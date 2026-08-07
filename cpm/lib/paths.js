'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Package home (aligned with src/atom-paths.js — Chevron-only default).
 */
function getPackageHome() {
  if (process.env.CHEVRON_HOME) return process.env.CHEVRON_HOME;
  if (process.env.ATOM_HOME) return process.env.ATOM_HOME;

  return path.join(os.homedir(), '.chevron');
}

function getPackagesDirectory(packageHome = getPackageHome()) {
  return path.join(packageHome, 'packages');
}

function getCpmMetaDirectory(packageHome = getPackageHome()) {
  return path.join(packageHome, '.cpm');
}

function getElectronVersion() {
  if (process.env.npm_config_target) return process.env.npm_config_target;
  if (process.versions && process.versions.electron) {
    return process.versions.electron;
  }
  try {
    const pkgPath = path.join(__dirname, '..', '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      return require(pkgPath).electronVersion;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
}

function isElectronAsNode() {
  return Boolean(
    process.versions &&
      process.versions.electron &&
      process.env.ELECTRON_RUN_AS_NODE
  );
}

module.exports = {
  getPackageHome,
  getPackagesDirectory,
  getCpmMetaDirectory,
  getElectronVersion,
  isElectronAsNode
};
