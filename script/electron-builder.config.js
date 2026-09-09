'use strict';

// electron-builder is used for one thing: turning the app that
// package-application.js already assembled into a Windows NSIS installer,
// signing that installer, and writing latest.yml + the blockmap that
// electron-updater downloads (docs/reference/auto-update.md). It runs with
// --prepackaged, so nothing here changes what is inside the app.
//
// Signing reads WIN_CSC_LINK / WIN_CSC_KEY_PASSWORD from the environment and
// is skipped, with a warning, when they are absent.

const path = require('path');
const CONFIG = require('./config');
const { githubRepoFromUrl } = require('./lib/update-config-file');

const repository = githubRepoFromUrl(CONFIG.appMetadata.repository.url);
const iconDir = path.join('resources', 'app-icons', CONFIG.channel);

module.exports = {
  appId: 'dev.builtbygio.chevron',
  productName: CONFIG.appName,
  executableName: CONFIG.executableName.replace(/\.exe$/i, ''),
  electronVersion: CONFIG.appMetadata.electronVersion,
  copyright: `Copyright © 2014-${new Date().getFullYear()} Chevron contributors and original Atom authors.`,
  directories: {
    output: path.join('out', 'installer'),
    buildResources: 'resources'
  },
  // Present so latest.yml is written; -p never keeps electron-builder from
  // uploading. The release job attaches the files itself.
  publish: {
    provider: 'github',
    owner: repository.owner,
    repo: repository.repo,
    releaseType: 'prerelease'
  },
  npmRebuild: false,
  nodeGypRebuild: false,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: path.join(iconDir, 'chevron.ico'),
    // The updater checks the downloaded installer's signature against the
    // signer of the running app; an unsigned build has nothing to check.
    verifyUpdateCodeSignature: true,
    signtoolOptions: {
      publisherName: process.env.WIN_PUBLISHER_NAME || undefined
    }
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    shortcutName: CONFIG.appName,
    // No spaces: GitHub rewrites them in asset names and the yml would not match.
    // eslint-disable-next-line no-template-curly-in-string
    artifactName: 'chevron-${version}-windows-${arch}-setup.${ext}',
    installerIcon: path.join(iconDir, 'chevron.ico'),
    uninstallerIcon: path.join(iconDir, 'chevron.ico'),
    uninstallDisplayName: CONFIG.appName,
    differentialPackage: true
  }
};
