'use strict';

/**
 * cpm install <path>
 *
 * Installs an owned package from a directory into
 * $CHEVRON_HOME/packages/<name>, as docs/reference/lsp-server-distribution.md
 * describes ("users opt in via cpm install ./packages/chevron-lsp-rust").
 *
 * A path rather than a name: the owned catalog is not published, so there is
 * no index to resolve a name against and nothing to verify a download with.
 * Installing from a URL waits for that (docs/reference/package-artifact-format.md).
 *
 * Unlike `cpm link`, this copies. A link makes the editor load a working
 * directory, which is right while developing a package and wrong for
 * installing one -- editing the checkout would change the installed package
 * underneath the editor.
 */

const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { getPackagesDirectory } = require('../paths');
const { ensureLanguageServerBinary } = require('../language-server-prebuild');

function readManifest(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch (error) {
    return null;
  }
}

// Compare two semver-ish strings without pulling in a dependency; only used to
// tell the user which direction they are moving.
function compareVersions(a, b) {
  const parse = v =>
    String(v || '0')
      .split('-')[0]
      .split('.')
      .map(n => parseInt(n, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((left[i] || 0) > (right[i] || 0)) return 1;
    if ((left[i] || 0) < (right[i] || 0)) return -1;
  }
  return 0;
}

function run(command, args, cwd) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });
    let output = '';
    child.stdout.on('data', d => (output += d));
    child.stderr.on('data', d => (output += d));
    child.on('error', error => resolve({ code: 1, output: String(error.message) }));
    child.on('close', code => resolve({ code, output }));
  });
}

async function installPackage(targetPath, options = {}) {
  const source = path.resolve(targetPath || process.cwd());
  const manifest = readManifest(source);
  if (!manifest) {
    process.stderr.write(`cpm install: not a package: ${source}\n`);
    return 1;
  }
  if (!manifest.name) {
    process.stderr.write('cpm install: package.json missing name\n');
    return 1;
  }

  const name = path.basename(manifest.name);
  const packagesDir = getPackagesDirectory();
  const dest = path.join(packagesDir, name);

  // One version per package id. If something is already there, say what it is
  // and what would replace it, and require --force to go through with a
  // downgrade rather than silently reversing the user.
  if (await fs.pathExists(dest)) {
    const existing = readManifest(dest);
    const existingVersion = existing ? existing.version : 'unknown';
    const direction = compareVersions(existingVersion, manifest.version);
    if (direction > 0 && !options.force) {
      process.stderr.write(
        `cpm install: ${name}@${existingVersion} is already installed, which ` +
          `is newer than ${manifest.version}.\n` +
          `A package is not kept in two versions; continuing uninstalls ` +
          `${existingVersion} first.\n` +
          `Re-run with --force to replace it.\n`
      );
      return 1;
    }
    process.stdout.write(
      `Replacing ${name}@${existingVersion} with ${manifest.version}\n`
    );
    await fs.remove(dest);
  }

  await fs.ensureDir(packagesDir);
  // node_modules is rebuilt below rather than copied: the source tree is a
  // workspace member, so its dependencies are hoisted somewhere else entirely
  // and copying would take whatever happens to be nested.
  await fs.copy(source, dest, {
    filter: src => path.basename(src) !== 'node_modules'
  });

  const dependencies = Object.keys(manifest.dependencies || {});
  if (dependencies.length > 0) {
    process.stdout.write(
      `Installing ${dependencies.length} dependencies for ${name}…\n`
    );
    const result = await run(
      'npm',
      ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel=error'],
      dest
    );
    if (result.code !== 0) {
      process.stderr.write(
        `cpm install: dependency install failed for ${name}\n${result.output}\n`
      );
      await fs.remove(dest);
      return 1;
    }
  }

  // Language-server packages may carry a prebuilt binary rather than an npm
  // dependency; this is a no-op for everything else.
  try {
    const binary = await ensureLanguageServerBinary(dest, {});
    if (binary && binary.ok === false && binary.reason) {
      process.stderr.write(
        `cpm install: ${name} installed, but its language-server binary did ` +
          `not: ${binary.reason}\n`
      );
    }
  } catch (error) {
    process.stderr.write(
      `cpm install: ${name} installed, but the language-server step failed: ` +
        `${error.message}\n`
    );
  }

  const engines = manifest.engines && manifest.engines.chevron;
  if (engines) {
    process.stdout.write(`${name} requires Chevron ${engines}\n`);
  }
  process.stdout.write(`Installed ${manifest.name}@${manifest.version} → ${dest}\n`);
  return 0;
}

module.exports = { installPackage, compareVersions };
