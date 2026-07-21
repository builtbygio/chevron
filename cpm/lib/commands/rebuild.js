'use strict';

/**
 * Rebuild contract (§5.5.1):
 * - Accept: rebuild [--no-color]  (cwd = package) or rebuild [name]
 * - Exit 0 success; non-zero failure
 * - stderr carries human-readable failure detail for Package.rebuild()
 */

const fs = require('fs');
const path = require('path');
const { getPackagesDirectory, getElectronVersion } = require('../paths');

async function rebuildPackages(names, options = {}) {
  const noColor = options.noColor || process.argv.includes('--no-color');
  void noColor; // accepted for contract; we never emit ANSI in this path

  const targets = [];
  if (!names || names.length === 0) {
    // Package.runRebuildProcess: cwd is the package path
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
      const msg = `cpm rebuild: not a package directory: ${target}\n`;
      process.stderr.write(msg);
      failed = true;
      continue;
    }

    const hasNative =
      fs.existsSync(path.join(target, 'binding.gyp')) ||
      fs.existsSync(path.join(target, 'node_modules'));

    if (!hasNative && !fs.existsSync(path.join(target, 'binding.gyp'))) {
      // Still try rebuild for deps; empty package is ok
    }

    try {
      await rebuildOne(target);
      process.stdout.write(`Rebuilt: ${target}\n`);
    } catch (err) {
      failed = true;
      const detail = err && err.stack ? err.stack : String(err);
      process.stderr.write(`cpm rebuild failed for ${target}:\n${detail}\n`);
    }
  }

  return failed ? 1 : 0;
}

async function rebuildOne(packagePath) {
  const electronVersion = getElectronVersion();
  if (!electronVersion) {
    throw new Error(
      'Cannot determine Electron version. Run via ELECTRON_RUN_AS_NODE product launcher.'
    );
  }

  let rebuild;
  try {
    // Prefer dependency when cpm/node_modules is installed
    rebuild = require('@electron/rebuild').rebuild;
  } catch (_) {
    // Fallback: try monorepo root
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

module.exports = { rebuildPackages };
