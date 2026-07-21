'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Dual-support package home (aligned with src/atom-paths.js resolveConfigHome).
 */
function getPackageHome() {
  if (process.env.CHEVRON_HOME) return process.env.CHEVRON_HOME;
  if (process.env.ATOM_HOME) return process.env.ATOM_HOME;

  const home = os.homedir();
  const chevronHome = path.join(home, '.chevron');
  if (fs.existsSync(chevronHome)) return chevronHome;
  return path.join(home, '.atom');
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
    // Running under ELECTRON_RUN_AS_NODE inside product binary.
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
