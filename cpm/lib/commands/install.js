'use strict';

/**
 * Install community packages into dual-home packages dir.
 * Default: ignore lifecycle scripts (security).
 * Uses pacote + arborist when available; fails clearly if not installed.
 */

const fs = require('fs-extra');
const path = require('path');
const {
  getPackageHome,
  getPackagesDirectory,
  getCpmMetaDirectory
} = require('../paths');
const { rebuildPackages } = require('./rebuild');
const { checkEngines, getProductVersion } = require('../engines');

function packageDirName(name) {
  // Unscoped: "foo". Scoped: "@scope/foo" → keep nested dir under packages/
  if (name.startsWith('@') && name.includes('/')) {
    return name; // path.join will create packages/@scope/foo
  }
  return name;
}

async function installPackage(spec, options = {}) {
  const packagesDir = getPackagesDirectory();
  await fs.ensureDir(packagesDir);
  await fs.ensureDir(getCpmMetaDirectory());

  const allowScripts = Boolean(options.allowScripts);
  const strictEngines = Boolean(options.strict);
  let pacote;
  let Arborist;
  try {
    pacote = require('pacote');
    Arborist = require('@npmcli/arborist');
  } catch (err) {
    process.stderr.write(
      'cpm install: missing pacote/@npmcli/arborist. Run: (cd cpm && npm install)\n'
    );
    return 1;
  }

  // Resolve name for directory
  let manifest;
  try {
    manifest = await pacote.manifest(spec, {
      fullMetadata: true
    });
  } catch (err) {
    process.stderr.write(`cpm install: failed to resolve ${spec}: ${err.message}\n`);
    return 1;
  }

  const name = manifest.name;
  if (!name) {
    process.stderr.write(`cpm install: could not determine package name for ${spec}\n`);
    return 1;
  }

  const productVersion = getProductVersion();
  const engineCheck = checkEngines(manifest, productVersion, {
    strict: strictEngines
  });
  for (const w of engineCheck.warnings) {
    process.stderr.write(`cpm install warning: ${w}\n`);
  }
  if (!engineCheck.ok) {
    for (const e of engineCheck.errors) {
      process.stderr.write(`cpm install: ${e}\n`);
    }
    return 1;
  }

  const dest = path.join(packagesDir, packageDirName(name));
  process.stdout.write(`Installing ${name}@${manifest.version} → ${dest}\n`);

  if (await fs.pathExists(dest)) {
    await fs.remove(dest);
  }
  await fs.ensureDir(dest);

  try {
    await pacote.extract(spec, dest, {});
  } catch (err) {
    process.stderr.write(`cpm install: extract failed: ${err.message}\n`);
    return 1;
  }

  // Install package dependencies into dest/node_modules
  try {
    const arb = new Arborist({
      path: dest,
      ignoreScripts: !allowScripts
    });
    await arb.reify({
      ignoreScripts: !allowScripts
    });
  } catch (err) {
    process.stderr.write(
      `cpm install: dependency install failed: ${err.message}\n`
    );
    return 1;
  }

  if (fs.existsSync(path.join(dest, 'binding.gyp'))) {
    process.stdout.write('Native module detected; rebuilding for Electron…\n');
    const prev = process.cwd();
    try {
      process.chdir(dest);
      const code = await rebuildPackages([], { noColor: true });
      if (code !== 0) return code;
    } finally {
      process.chdir(prev);
    }
  }

  process.stdout.write(`Installed ${name}@${manifest.version}\n`);
  process.stdout.write(`Package home: ${getPackageHome()}\n`);
  return 0;
}

module.exports = { installPackage };
