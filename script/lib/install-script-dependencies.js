'use strict';

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');
const { hostCanRunMksnapshot } = require('./mksnapshot-host-support');

// Recognised by '@electron/get', used by the 'electron-mksnapshot' and 'electron-chromedriver' dependencies
process.env.ELECTRON_CUSTOM_VERSION = CONFIG.appMetadata.electronVersion;

module.exports = function(ci) {
  console.log('Installing script dependencies');
  const npmBin = CONFIG.getNpmBinPath(ci);
  const args = ['--loglevel=error', ci ? 'ci' : 'install'];
  const skipMksnapshot = !hostCanRunMksnapshot();

  if (skipMksnapshot) {
    // electron-mksnapshot's install script hard-exits on linux/win arm hosts.
    // Install the rest of script deps without lifecycle scripts, then finish
    // the ones we still need (chromedriver + native addons).
    console.log(
      `NOTE: mksnapshot cannot run on ${process.platform}-${process.arch}; ` +
        'using --ignore-scripts and completing select postinstalls without it.'
    );
    args.push('--ignore-scripts');
  }

  childProcess.execFileSync(npmBin, args, {
    env: process.env,
    cwd: CONFIG.scriptRootPath
  });

  if (skipMksnapshot) {
    finishScriptDepsWithoutMksnapshot(ci);
  }
};

function finishScriptDepsWithoutMksnapshot(ci) {
  // Chromedriver ships native arm64 linux binaries — fine to download here.
  runNodeModuleScript(
    'electron-chromedriver',
    'download-chromedriver.js',
    'chromedriver download'
  );

  // Packages that normally compile / fetch binaries during install.
  for (const pkg of ['fs-admin', 'leveldown']) {
    try {
      console.log(`Rebuilding ${pkg}…`);
      childProcess.execFileSync(
        CONFIG.getNpmBinPath(ci),
        ['rebuild', pkg, '--loglevel=error'],
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

  // minidump uses a custom preinstall (node build.js), not node-gyp rebuild.
  runNodeModuleScript('minidump', 'build.js', 'minidump build');

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
    console.log(`Running ${label}…`);
    childProcess.execFileSync(process.execPath, [scriptPath], {
      env: process.env,
      cwd: path.dirname(scriptPath),
      stdio: 'inherit'
    });
  } catch (error) {
    console.warn(`WARNING: ${label} failed (continuing): ${error.message}`);
  }
}
