'use strict';

/**
 * Windows installer: NSIS through electron-builder, from the app that
 * package-application.js assembled (--prepackaged). Squirrel.Windows, which
 * this used to produce, depended on an update service that no longer exists;
 * NSIS is what electron-updater installs.
 *
 * Writes into out/: the setup .exe, its .blockmap, and latest.yml.
 */

const fs = require('fs-extra');
const path = require('path');
const spawnSync = require('./spawn-sync');
const CONFIG = require('../config');

const INSTALLER_OUT = path.join(CONFIG.buildOutputPath, 'installer');
const KEEP = /\.(exe|blockmap|yml)$/i;

module.exports = async function createWindowsInstaller(packagedAppPath) {
  const cli = path.join(
    CONFIG.scriptRootPath,
    'node_modules',
    'electron-builder',
    'cli.js'
  );
  const config = path.join(CONFIG.scriptRootPath, 'electron-builder.config.js');
  fs.removeSync(INSTALLER_OUT);

  console.log(`Creating NSIS installer for ${packagedAppPath}`);
  spawnSync(
    process.execPath,
    [
      cli,
      '--win',
      'nsis',
      '--x64',
      '--prepackaged',
      packagedAppPath,
      '--config',
      config,
      '--publish',
      'never'
    ],
    { cwd: CONFIG.repositoryRootPath, stdio: 'inherit', env: process.env }
  );

  let installerPath = null;
  for (const name of fs.readdirSync(INSTALLER_OUT)) {
    if (!KEEP.test(name)) continue;
    const target = path.join(CONFIG.buildOutputPath, name);
    fs.moveSync(path.join(INSTALLER_OUT, name), target, { overwrite: true });
    if (name.endsWith('.exe')) installerPath = target;
  }
  if (!installerPath) {
    throw new Error(
      `electron-builder wrote no installer into ${INSTALLER_OUT}`
    );
  }
  console.log(`Installer at ${installerPath}`);
  return installerPath;
};
