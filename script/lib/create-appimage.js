'use strict';

/**
 * Linux AppImage through electron-builder, from the app that
 * package-application.js assembled (--prepackaged). x64 only: the arm64
 * packages are no longer built, and this file is not a second arch.
 *
 * Writes `chevron-<version>-x64.AppImage` into out/. The updater metadata
 * electron-builder also emits stays behind; Linux still updates from the
 * Releases page (docs/reference/auto-update.md).
 */

const fs = require('fs-extra');
const path = require('path');
const spawnSync = require('./spawn-sync');
const CONFIG = require('../config');

const APPIMAGE_OUT = path.join(CONFIG.buildOutputPath, 'installer');

function createAppImage(packagedAppPath) {
  if (process.platform !== 'linux') {
    throw new Error(`AppImage is a Linux package, not ${process.platform}`);
  }
  if (process.arch !== 'x64') {
    throw new Error(`AppImage is built for x64 only, not ${process.arch}`);
  }

  const cli = path.join(
    CONFIG.scriptRootPath,
    'node_modules',
    'electron-builder',
    'cli.js'
  );
  const config = path.join(CONFIG.scriptRootPath, 'electron-builder.config.js');
  fs.removeSync(APPIMAGE_OUT);

  console.log(`Creating AppImage for ${packagedAppPath}`);
  spawnSync(
    process.execPath,
    [
      cli,
      '--linux',
      'AppImage',
      '--x64',
      '--prepackaged',
      packagedAppPath,
      '--config',
      config,
      '--publish',
      'never'
    ],
    {
      cwd: CONFIG.repositoryRootPath,
      stdio: 'inherit',
      // appimagetool is itself an AppImage. Extract it instead of mounting
      // it, so the build does not need FUSE.
      env: Object.assign({}, process.env, { APPIMAGE_EXTRACT_AND_RUN: '1' })
    }
  );

  let appImagePath = null;
  for (const name of fs.readdirSync(APPIMAGE_OUT)) {
    if (!name.endsWith('.AppImage')) continue;
    const target = path.join(CONFIG.buildOutputPath, name);
    fs.moveSync(path.join(APPIMAGE_OUT, name), target, { overwrite: true });
    appImagePath = target;
  }
  if (!appImagePath) {
    throw new Error(
      `electron-builder wrote no AppImage into ${APPIMAGE_OUT}`
    );
  }
  console.log(`AppImage at ${appImagePath}`);
  return appImagePath;
}

module.exports = createAppImage;
