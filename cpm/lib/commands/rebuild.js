'use strict';

/**
 * Rebuild contract (§5.5.1):
 * - Accept: rebuild [--no-color]  (cwd = package) or rebuild [name]
 * - Exit 0 success; non-zero failure
 * - stderr carries human-readable failure detail for Package.rebuild()
 *
 * Phase 3: try prebuilds first, then @electron/rebuild source compile.
 */

const fs = require('fs');
const path = require('path');
const { getPackagesDirectory, getElectronVersion } = require('../paths');
const {
  packageNeedsNative,
  hasNativeBinary,
  tryPrebuilds
} = require('../prebuild');

async function rebuildPackages(names, options = {}) {
  const noColor = options.noColor || process.argv.includes('--no-color');
  void noColor;
  const forceSource =
    options.forceSource || process.argv.includes('--force-source');

  const targets = [];
  if (!names || names.length === 0) {
    targets.push(process.cwd());
  } else {
    const packagesDir = getPackagesDirectory();
    for (const name of names) {
      if (fs.existsSync(name) && fs.statSync(name).isDirectory()) {
        targets.push(path.resolve(name));
      } else {
        targets.push(path.join(packagesDir, name));
      }
    }
  }

  let failed = false;
  for (const target of targets) {
    if (!fs.existsSync(path.join(target, 'package.json'))) {
      process.stderr.write(
        `cpm rebuild: not a package directory: ${target}\n`
      );
      failed = true;
      continue;
    }

    try {
      await rebuildOne(target, { forceSource });
      process.stdout.write(`Rebuilt: ${target}\n`);
    } catch (err) {
      failed = true;
      const detail = err && err.stack ? err.stack : String(err);
      process.stderr.write(`cpm rebuild failed for ${target}:\n${detail}\n`);
    }
  }

  return failed ? 1 : 0;
}

async function rebuildOne(packagePath, options = {}) {
  const electronVersion = getElectronVersion();
  if (!electronVersion) {
    throw new Error(
      'Cannot determine Electron version. Run via ELECTRON_RUN_AS_NODE product launcher.'
    );
  }

  // Pure JS package (no binding.gyp): nothing to rebuild
  if (!packageNeedsNative(packagePath)) {
    process.stdout.write(
      `cpm rebuild: no binding.gyp in ${packagePath} (skip native rebuild)\n`
    );
    return;
  }

  if (!options.forceSource) {
    const pre = await tryPrebuilds(packagePath, {
      electronVersion,
      force: options.force
    });
    if (pre.ok && pre.strategy !== 'no-native') {
      process.stdout.write(
        `cpm rebuild: using prebuild (${pre.strategy})\n`
      );
      if (hasNativeBinary(packagePath)) return;
    } else if (pre.reason && pre.reason !== 'forceSource') {
      process.stdout.write(
        `cpm rebuild: no prebuild (${pre.reason}); compiling from source\n`
      );
    }
  } else {
    process.stdout.write('cpm rebuild: --force-source (skipping prebuilds)\n');
  }

  let rebuild;
  try {
    rebuild = require('@electron/rebuild').rebuild;
  } catch (_) {
    try {
      rebuild = require(path.join(
        __dirname,
        '..',
        '..',
        '..',
        'node_modules',
        '@electron/rebuild'
      )).rebuild;
    } catch (e2) {
      throw new Error(
        '@electron/rebuild is not available. Install cpm dependencies (cd cpm && npm install).'
      );
    }
  }

  await rebuild({
    buildPath: packagePath,
    electronVersion,
    force: true,
    onlyModules: undefined
  });
}

module.exports = { rebuildPackages, rebuildOne };
