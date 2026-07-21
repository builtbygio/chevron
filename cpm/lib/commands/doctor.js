'use strict';

const fs = require('fs');
const path = require('path');
const {
  getPackageHome,
  getPackagesDirectory,
  getCpmMetaDirectory,
  getElectronVersion,
  isElectronAsNode
} = require('../paths');
const { getRegistryBaseUrl } = require('../registry');

function doctor() {
  const home = getPackageHome();
  const packagesDir = getPackagesDirectory(home);
  const metaDir = getCpmMetaDirectory(home);
  const electronVersion = getElectronVersion();

  console.log('cpm doctor');
  console.log('----------');
  console.log(`cpm version:     ${require('../../package.json').version}`);
  console.log(`node:            ${process.version}`);
  console.log(`platform:        ${process.platform} ${process.arch}`);
  console.log(`execPath:        ${process.execPath}`);
  console.log(
    `electron:        ${electronVersion || '(unknown)'}${
      process.versions.electron ? ` (process.versions.electron=${process.versions.electron})` : ''
    }`
  );
  console.log(
    `ELECTRON_RUN_AS_NODE: ${process.env.ELECTRON_RUN_AS_NODE || '(unset)'}`
  );
  console.log(
    `electron-as-node: ${isElectronAsNode() ? 'yes' : 'NO — prefer product binary launchers'}`
  );
  console.log(`registry:        ${getRegistryBaseUrl()}`);
  console.log(`package home:    ${home}`);
  console.log(`packages dir:    ${packagesDir} ${fs.existsSync(packagesDir) ? '' : '(missing)'}`);
  console.log(`cpm meta:        ${metaDir}`);
  console.log(`CHEVRON_HOME:    ${process.env.CHEVRON_HOME || '(unset)'}`);
  console.log(`ATOM_HOME:       ${process.env.ATOM_HOME || '(unset)'}`);

  if (!isElectronAsNode()) {
    console.log('');
    console.log(
      'warning: not running under ELECTRON_RUN_AS_NODE + product binary.'
    );
    console.log(
      'Native rebuilds may target the wrong ABI. Use bin/cpm launcher.'
    );
    return 1;
  }
  return 0;
}

module.exports = { doctor };
