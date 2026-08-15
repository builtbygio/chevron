'use strict';

/**
 * Electron BP P3.2: flip production fuses on the packaged binary.
 * Soft-fails if @electron/fuses is missing or the platform binary path is odd.
 *
 * Usage: node script/lib/flip-electron-fuses.js <packagedAppPath>
 */

const fs = require('fs');
const path = require('path');

async function flipFusesOnApp(packagedAppPath) {
  let flipFuses;
  let FuseVersion;
  let FuseV1Options;
  try {
    ({ flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses'));
  } catch (error) {
    console.log(
      'NOTE: @electron/fuses not available; skipping fuse flip:',
      error.message
    );
    return;
  }

  if (!packagedAppPath || !fs.existsSync(packagedAppPath)) {
    console.warn(
      'NOTE: flip-electron-fuses: packaged path missing:',
      packagedAppPath
    );
    return;
  }

  let electronPath = packagedAppPath;
  if (process.platform === 'darwin') {
    // packagedAppPath is Foo.app
    const macOS = path.join(packagedAppPath, 'Contents', 'MacOS');
    if (fs.existsSync(macOS)) {
      const bins = fs.readdirSync(macOS);
      if (bins[0]) electronPath = path.join(macOS, bins[0]);
    }
  } else if (process.platform === 'win32') {
    const candidates = ['chevron.exe', 'Chevron.exe', 'atom.exe'];
    for (const name of candidates) {
      const p = path.join(packagedAppPath, name);
      if (fs.existsSync(p)) {
        electronPath = p;
        break;
      }
    }
  } else {
    // linux: directory containing chevron binary
    const candidates = ['chevron', 'Chevron', 'atom'];
    for (const name of candidates) {
      const p = path.join(packagedAppPath, name);
      if (fs.existsSync(p)) {
        electronPath = p;
        break;
      }
    }
  }

  console.log(`Flipping Electron fuses on ${electronPath}`);
  try {
    // EnableEmbeddedAsarIntegrityValidation requires packager-embedded
    // integrity resources. @electron/packager does this on macOS; on Windows
    // the fuse makes the app FATAL at startup (archive_win.cc FindResource).
    // OnlyLoadAppFromAsar breaks app.asar.unpacked natives + out-of-asar cpm.
    // Leave both off until packaging embeds integrity for all platforms.
    const asarIntegrityOk = process.platform === 'darwin';
    await flipFuses(electronPath, {
      version: FuseVersion.V1,
      // Keep RunAsNode for ELECTRON_RUN_AS_NODE tooling (cpm, smoke helpers).
      [FuseV1Options.RunAsNode]: true,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: asarIntegrityOk,
      [FuseV1Options.OnlyLoadAppFromAsar]: false
    });
    console.log(
      'Electron fuses flipped successfully' +
        (asarIntegrityOk ? ' (asar integrity on)' : ' (asar integrity skipped)')
    );
  } catch (error) {
    // Do not fail the build — fuses are hardening, not required to ship.
    console.warn(
      'NOTE: flip-electron-fuses failed (continuing package):',
      error && error.message ? error.message : error
    );
  }
}

module.exports = flipFusesOnApp;

if (require.main === module) {
  flipFusesOnApp(process.argv[2]).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
