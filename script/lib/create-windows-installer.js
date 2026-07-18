'use strict';

const electronInstaller = require('@atom/electron-winstaller');
const fs = require('fs');
const glob = require('glob');
const path = require('path');

const CONFIG = require('../config');

module.exports = packagedAppPath => {
  const archSuffix = process.arch === 'ia32' ? '' : '-' + process.arch;
  const updateUrlPrefix =
    process.env.ATOM_UPDATE_URL_PREFIX || 'https://atom.io';
  const options = {
    name: CONFIG.channelName,
    title: CONFIG.appName,
    exe: CONFIG.executableName,
    appDirectory: packagedAppPath,
    authors: 'Chevron contributors',
    iconUrl: `https://raw.githubusercontent.com/builtbygio/chevron/master/resources/app-icons/${
      CONFIG.channel
    }/atom.ico`,
    loadingGif: path.join(
      CONFIG.repositoryRootPath,
      'resources',
      'win',
      'loading.gif'
    ),
    outputDirectory: CONFIG.buildOutputPath,
    noMsi: true,
    remoteReleases: `${updateUrlPrefix}/api/updates${archSuffix}?version=${
      CONFIG.computedAppVersion
    }`,
    setupExe: `ChevronSetup${process.arch === 'x64' ? '-x64' : ''}.exe`,
    setupIcon: path.join(
      CONFIG.repositoryRootPath,
      'resources',
      'app-icons',
      CONFIG.channel,
      'atom.ico'
    )
  };

  const cleanUp = () => {
    const releasesPath = `${CONFIG.buildOutputPath}/RELEASES`;
    if (process.arch === 'x64' && fs.existsSync(releasesPath)) {
      fs.renameSync(releasesPath, `${releasesPath}-x64`);
    }

    // Squirrel nupkg prefix follows installer "name" (channelName → chevron).
    const nupkgPrefix = CONFIG.channelName;
    for (let nupkgPath of glob.sync(
      `${CONFIG.buildOutputPath}/${nupkgPrefix}-*.nupkg`
    )) {
      if (!nupkgPath.includes(CONFIG.computedAppVersion)) {
        console.log(
          `Deleting downloaded nupkg for previous version at ${nupkgPath} to prevent it from being stored as an artifact`
        );
        fs.unlinkSync(nupkgPath);
      } else {
        if (process.arch === 'x64') {
          const newNupkgPath = nupkgPath.replace(
            `${nupkgPrefix}-`,
            `${nupkgPrefix}-x64-`
          );
          fs.renameSync(nupkgPath, newNupkgPath);
        }
      }
    }

    return `${CONFIG.buildOutputPath}/${options.setupExe}`;
  };

  console.log(`Creating Windows Installer for ${packagedAppPath}`);
  return electronInstaller
    .createWindowsInstaller(options)
    .then(cleanUp, error => {
      cleanUp();
      return Promise.reject(error);
    });
};
