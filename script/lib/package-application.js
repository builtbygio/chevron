'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const electronPackager = require('electron-packager');
const fs = require('fs-extra');
const hostArch = require('@electron/get').getHostArch;
const includePathInPackagedApp = require('./include-path-in-packaged-app');
const getLicenseText = require('./get-license-text');
const path = require('path');
const spawnSync = require('./spawn-sync');
const template = require('lodash.template');

const CONFIG = require('../config');
const HOST_ARCH = hostArch();

module.exports = function() {
  const appName = getAppName();
  console.log(
    `Running electron-packager on ${
      CONFIG.intermediateAppPath
    } with app name "${appName}"`
  );
  return runPackager({
    // Public install identity (new reverse-DNS; no Atom upgrade path).
    appBundleId: 'dev.builtbygio.chevron',
    appCopyright: `Copyright © 2014-${new Date().getFullYear()} Chevron contributors and original Atom authors. All rights reserved.`,
    appVersion: CONFIG.appMetadata.version,
    // Native arch on each host (Intel x64 or Apple Silicon arm64 on macOS).
    arch: HOST_ARCH,
    asar: { unpack: buildAsarUnpackGlobExpression() },
    buildVersion: CONFIG.appMetadata.version,
    derefSymlinks: false,
    download: { cache: CONFIG.electronDownloadPath },
    dir: CONFIG.intermediateAppPath,
    electronVersion: CONFIG.appMetadata.electronVersion,
    extendInfo: path.join(
      CONFIG.repositoryRootPath,
      'resources',
      'mac',
      'atom-Info.plist'
    ),
    helperBundleId: 'dev.builtbygio.chevron.helper',
    icon: path.join(
      CONFIG.repositoryRootPath,
      'resources',
      'app-icons',
      CONFIG.channel,
      'chevron'
    ),
    name: appName,
    // electron-packager appends .exe on Windows; CONFIG.executableName already
    // includes it for installers/signing — strip so we get chevron.exe not
    // chevron.exe.exe.
    executableName:
      process.platform === 'win32'
        ? CONFIG.executableName.replace(/\.exe$/i, '')
        : CONFIG.executableName,
    out: CONFIG.buildOutputPath,
    overwrite: true,
    platform: process.platform,
    // Atom doesn't have devDependencies, but if prune is true, it will delete the non-standard packageDependencies.
    prune: false,
    win32metadata: {
      CompanyName: 'Chevron',
      FileDescription: CONFIG.appName,
      ProductName: CONFIG.appName
    }
  }).then(packagedAppPath => {
    let bundledResourcesPath;
    if (process.platform === 'darwin') {
      bundledResourcesPath = path.join(
        packagedAppPath,
        'Contents',
        'Resources'
      );
      setAtomHelperVersion(packagedAppPath);
    } else if (process.platform === 'linux') {
      bundledResourcesPath = path.join(packagedAppPath, 'resources');
      chmodNodeFiles(packagedAppPath);
    } else {
      bundledResourcesPath = path.join(packagedAppPath, 'resources');
    }

    return copyNonASARResources(packagedAppPath, bundledResourcesPath).then(
      () => {
        console.log(`Application bundle created at ${packagedAppPath}`);
        return packagedAppPath;
      }
    );
  });
};

function copyNonASARResources(packagedAppPath, bundledResourcesPath) {
  console.log(`Copying non-ASAR resources to ${bundledResourcesPath}`);

  // Phase 4: ship cpm only (no classic atom-package-manager Node 12 tree).
  const cpmSrc = path.join(CONFIG.repositoryRootPath, 'cpm');
  if (!fs.existsSync(cpmSrc)) {
    throw new Error(
      'cpm/ is required for packaging (Phase 4: classic apm removed from product)'
    );
  }
  if (!fs.existsSync(path.join(cpmSrc, 'node_modules'))) {
    console.log('Installing cpm dependencies before packaging…');
    const { execFileSync } = require('child_process');
    const npmArgs = fs.existsSync(path.join(cpmSrc, 'package-lock.json'))
      ? ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
      : ['install', '--ignore-scripts', '--no-audit', '--no-fund'];
    execFileSync('npm', npmArgs, {
      cwd: cpmSrc,
      stdio: 'inherit',
      env: process.env
    });
  }
  console.log('Copying cpm into packaged app resources…');
  fs.copySync(cpmSrc, path.join(bundledResourcesPath, 'app', 'cpm'), {
    filter: includePathInPackagedApp
  });

  // Legacy app/apm/... paths → real launcher scripts (not symlinks: broken
  // relative links break fs.copySync when creating deb/rpm).
  // From app/apm/bin → ../../cpm/bin/apm; from app/apm/node_modules/.bin → ../../../cpm/bin/apm
  const legacyApmBin = path.join(
    bundledResourcesPath,
    'app',
    'apm',
    'node_modules',
    '.bin'
  );
  fs.mkdirSync(legacyApmBin, { recursive: true });
  const legacyApmTop = path.join(bundledResourcesPath, 'app', 'apm', 'bin');
  fs.mkdirSync(legacyApmTop, { recursive: true });

  const writeUnixShim = (filePath, relToCpmApm) => {
    fs.writeFileSync(
      filePath,
      `#!/bin/bash\nexec "$(dirname "$0")/${relToCpmApm}" "$@"\n`,
      { mode: 0o755 }
    );
  };
  const writeWinShim = (filePath, relToCpmApmCmd) => {
    fs.writeFileSync(
      filePath,
      `@echo off\r\n"%~dp0${relToCpmApmCmd}" %*\r\n`
    );
  };

  if (process.platform === 'win32') {
    writeWinShim(path.join(legacyApmBin, 'apm.cmd'), '..\\..\\..\\cpm\\bin\\apm.cmd');
    writeWinShim(path.join(legacyApmTop, 'apm.cmd'), '..\\..\\cpm\\bin\\apm.cmd');
  } else {
    writeUnixShim(path.join(legacyApmBin, 'apm'), '../../../cpm/bin/apm');
    writeUnixShim(path.join(legacyApmTop, 'apm'), '../../cpm/bin/apm');
  }

  // Ensure cpm launchers are executable after filter copy
  const cpmBinDir = path.join(bundledResourcesPath, 'app', 'cpm', 'bin');
  for (const name of ['cpm', 'apm']) {
    const p = path.join(cpmBinDir, name);
    if (fs.existsSync(p)) {
      try {
        fs.chmodSync(p, 0o755);
      } catch (_) {
        /* ignore */
      }
    }
  }

  if (process.platform !== 'win32') {
    fs.copySync(
      path.join(CONFIG.repositoryRootPath, 'atom.sh'),
      path.join(bundledResourcesPath, 'app', 'atom.sh')
    );
  }
  if (process.platform === 'darwin') {
    fs.copySync(
      path.join(CONFIG.repositoryRootPath, 'resources', 'mac', 'file.icns'),
      path.join(bundledResourcesPath, 'file.icns')
    );
  } else if (process.platform === 'linux') {
    const iconSrc = path.join(
      CONFIG.repositoryRootPath,
      'resources',
      'app-icons',
      CONFIG.channel,
      'png',
      '1024.png'
    );
    // Channel desktop name + legacy atom.png for any leftover packaging paths.
    fs.copySync(iconSrc, path.join(packagedAppPath, 'atom.png'));
    fs.copySync(iconSrc, path.join(packagedAppPath, 'chevron.png'));
    fs.copySync(
      iconSrc,
      path.join(packagedAppPath, `${CONFIG.channelName}.png`)
    );
  } else if (process.platform === 'win32') {
    [
      'atom.sh',
      'atom.js',
      'apm.cmd',
      'apm.sh',
      'cpm.cmd',
      'cpm.sh',
      'file.ico',
      'folder.ico'
    ].forEach(file => {
      const src = path.join(CONFIG.repositoryRootPath, 'resources', 'win', file);
      if (fs.existsSync(src)) {
        fs.copySync(src, path.join(bundledResourcesPath, 'cli', file));
      }
    });

    // Customize atom.cmd for the channel-specific atom.exe name (e.g. atom-beta.exe)
    generateAtomCmdForChannel(bundledResourcesPath);
  }

  console.log(`Writing LICENSE.md to ${bundledResourcesPath}`);
  return getLicenseText().then(licenseText => {
    fs.writeFileSync(
      path.join(bundledResourcesPath, 'LICENSE.md'),
      licenseText
    );
  });
}

function setAtomHelperVersion(packagedAppPath) {
  const frameworksPath = path.join(packagedAppPath, 'Contents', 'Frameworks');
  // electron-packager names helpers from the app name (e.g. "Chevron Helper.app").
  // Fall back to legacy Atom Helper if present.
  const appName = getAppName();
  const helperCandidates = [
    `${appName} Helper.app`,
    'Chevron Helper.app',
    'Atom Helper.app'
  ];
  let helperAppDir = null;
  for (const name of helperCandidates) {
    const candidate = path.join(frameworksPath, name);
    if (fs.existsSync(candidate)) {
      helperAppDir = candidate;
      break;
    }
  }
  if (!helperAppDir) {
    console.log(
      `WARNING: no Helper.app under ${frameworksPath}; skip helper version stamp`
    );
    return;
  }
  const helperPListPath = path.join(helperAppDir, 'Contents', 'Info.plist');
  console.log(`Setting Helper Version for ${helperPListPath}`);
  // Use Set-or-Add: Electron's Helper Info.plist already defines these keys.
  // Plain Add fails with "Entry Already Exists" and aborts packaging (CI).
  setPlistString(
    helperPListPath,
    'CFBundleVersion',
    CONFIG.appMetadata.version
  );
  setPlistString(
    helperPListPath,
    'CFBundleShortVersionString',
    CONFIG.appMetadata.version
  );
}

function setPlistString(plistPath, key, value) {
  const setResult = childProcess.spawnSync('/usr/libexec/PlistBuddy', [
    '-c',
    `Set :${key} ${value}`,
    plistPath
  ]);
  if (setResult.status === 0) return;
  spawnSync('/usr/libexec/PlistBuddy', [
    '-c',
    `Add :${key} string ${value}`,
    plistPath
  ]);
}

function chmodNodeFiles(packagedAppPath) {
  console.log(`Changing permissions for node files in ${packagedAppPath}`);
  childProcess.execSync(
    `find "${packagedAppPath}" -type f -name *.node -exec chmod a-x {} \\;`
  );
}

function buildAsarUnpackGlobExpression() {
  // Files that must live on the real filesystem (not only inside app.asar):
  //
  // - Native .node addons and helper binaries (ctags, ripgrep, dugite git).
  // - github worker assets: WorkerManager loads renderer.html + worker.js via
  //   file:// under app.asar.unpacked (see getPackageRoot() in the github
  //   package). Previously only github/bin was unpacked, which produced
  //   ERR_FILE_NOT_FOUND for lib/renderer.html in packaged builds.
  const unpack = [
    '*.node',
    'ctags-config',
    'ctags-darwin',
    'ctags-linux',
    'ctags-win32.exe',
    path.join('**', 'node_modules', 'spellchecker', '**'),
    path.join('**', 'node_modules', 'dugite', 'git', '**'),
    path.join('**', 'node_modules', 'github', 'bin', '**'),
    path.join('**', 'node_modules', 'github', 'lib', '**'),
    path.join('**', 'node_modules', 'vscode-ripgrep', 'bin', '**'),
    path.join('**', 'resources', 'atom.png')
  ];

  return `{${unpack.join(',')}}`;
}

function getAppName() {
  if (process.platform === 'darwin') {
    return CONFIG.appName;
  } else if (process.platform === 'win32') {
    // electron-packager product folder name; binary is CONFIG.executableName (chevron.exe).
    return CONFIG.appName.replace(/\s+/g, '-');
  } else {
    // Linux: electron-packager dir is <name>-linux-<arch> (e.g. Chevron-linux-x64).
    // Spaces in product names become awkward paths; normalize for non-stable channels.
    return CONFIG.appName.replace(/\s+/g, '-');
  }
}

async function runPackager(options) {
  const packageOutputDirPaths = await electronPackager(options);

  assert(
    packageOutputDirPaths.length === 1,
    'Generated more than one electron application!'
  );

  return renamePackagedAppDir(packageOutputDirPaths[0]);
}

function renamePackagedAppDir(packageOutputDirPath) {
  let packagedAppPath;
  if (process.platform === 'darwin') {
    const appBundleName = getAppName() + '.app';
    packagedAppPath = path.join(CONFIG.buildOutputPath, appBundleName);
    if (fs.existsSync(packagedAppPath)) fs.removeSync(packagedAppPath);
    fs.renameSync(
      path.join(packageOutputDirPath, appBundleName),
      packagedAppPath
    );
  } else if (process.platform === 'linux') {
    // Keep electron-packager layout: <AppName>-linux-<arch> (matches smoke-test + docs).
    // Binary inside is CONFIG.executableName (chevron / chevron-<channel>).
    packagedAppPath = packageOutputDirPath;
  } else {
    packagedAppPath = path.join(CONFIG.buildOutputPath, CONFIG.appName);
    if (process.platform === 'win32' && HOST_ARCH !== 'ia32') {
      packagedAppPath += ` ${process.arch}`;
    }
    if (fs.existsSync(packagedAppPath)) fs.removeSync(packagedAppPath);
    fs.renameSync(packageOutputDirPath, packagedAppPath);
  }
  return packagedAppPath;
}

function generateAtomCmdForChannel(bundledResourcesPath) {
  const atomCmdTemplate = fs.readFileSync(
    path.join(CONFIG.repositoryRootPath, 'resources', 'win', 'atom.cmd')
  );
  const atomCmdContents = template(atomCmdTemplate)({
    atomExeName: CONFIG.executableName
  });
  fs.writeFileSync(
    path.join(bundledResourcesPath, 'cli', 'atom.cmd'),
    atomCmdContents
  );
}
