'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');
const execFileSync = require('./exec-file-sync');
const { hostCanRunMksnapshot } = require('./mksnapshot-host-support');

// Recognised by '@electron/get', used by the 'electron-mksnapshot' dependency
process.env.ELECTRON_CUSTOM_VERSION = CONFIG.appMetadata.electronVersion;

module.exports = function(ci) {
  console.log('Installing script dependencies');
  const npmBin = CONFIG.getNpmBinPath(ci);
  // Default npm loglevel: keep deprecation/peer warnings visible.
  // Some script packages still declare peers the lock does not satisfy.
  // neostandard itself peers ESLint 9 or 10.
  // cwd is script/, so the repo-root .npmrc is not applied.
  // Always skip lifecycle scripts. minidump 0.26's preinstall runs
  // `yarn submodule`, which fails under the Yarn 1 on CI. The packages that
  // actually need an install step are run explicitly below.
  const args = [ci ? 'ci' : 'install', '--legacy-peer-deps', '--ignore-scripts'];
  const skipMksnapshot = !hostCanRunMksnapshot();

  if (skipMksnapshot) {
    console.log(
      `NOTE: mksnapshot cannot run on ${process.platform}-${process.arch}; ` +
        'the snapshot download will be skipped.'
    );
  }

  const env = Object.assign({}, process.env, {
    ELECTRON_CUSTOM_VERSION: CONFIG.appMetadata.electronVersion
  });

  execFileSync(npmBin, args, {
    env,
    cwd: CONFIG.scriptRootPath,
    stdio: 'inherit'
  });

  finishScriptDeps(ci, skipMksnapshot);
};

function finishScriptDeps(ci, skipMksnapshot) {
  // Packages that normally compile / fetch binaries during install.
  for (const pkg of ['fs-admin', 'leveldown']) {
    try {
      console.log(`Rebuilding ${pkg}...`);
      execFileSync(
        CONFIG.getNpmBinPath(ci),
        ['rebuild', pkg],
        {
          env: process.env,
          cwd: CONFIG.scriptRootPath,
          stdio: 'inherit'
        }
      );
    } catch (error) {
      console.warn(
        `WARNING: rebuild ${pkg} failed (continuing): ${error.message}`
      );
    }
  }

  // esbuild's postinstall fetches its binary. minidump's build.js exits
  // immediately when dump_syms is already in the published package.
  runNodeModuleScript('esbuild', 'install.js', 'esbuild install');
  runNodeModuleScript('minidump', 'build.js', 'minidump build');

  if (!skipMksnapshot) {
    runNodeModuleScript(
      'electron-mksnapshot',
      'download-mksnapshot.js',
      'electron-mksnapshot download'
    );
    return;
  }

  const mksnapshotDir = path.join(
    CONFIG.scriptRootPath,
    'node_modules',
    'electron-mksnapshot'
  );
  fs.mkdirSync(mksnapshotDir, { recursive: true });
  fs.writeFileSync(
    path.join(mksnapshotDir, '.skipped-unsupported-host'),
    `Skipped: mksnapshot does not run on ${process.platform}-${process.arch}\n` +
      'Custom startup snapshot will be omitted; Electron stock V8 snapshots used.\n'
  );
  console.log(
    'electron-mksnapshot skipped on this host — build will use stock Electron V8 snapshots.'
  );
}

function runNodeModuleScript(packageName, scriptFile, label) {
  const scriptPath = path.join(
    CONFIG.scriptRootPath,
    'node_modules',
    packageName,
    scriptFile
  );
  if (!fs.existsSync(scriptPath)) {
    console.warn(`WARNING: missing ${scriptPath} (${label})`);
    return;
  }
  try {
    console.log(`Running ${label}...`);
    execFileSync(process.execPath, [scriptPath], {
      env: process.env,
      cwd: path.dirname(scriptPath),
      stdio: 'inherit'
    });
  } catch (error) {
    console.warn(`WARNING: ${label} failed (continuing): ${error.message}`);
  }
}
