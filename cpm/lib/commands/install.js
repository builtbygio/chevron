'use strict';

/**
 * Install community packages into dual-home packages dir.
 * Default: ignore lifecycle scripts (security).
 * Uses pacote + arborist when available; local paths are copied (pacote DirFetcher needs packing).
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
const {
  isBarePackageName,
  parseNameVersion,
  resolveInstallSpec
} = require('../registry');

function packageDirName(name) {
  if (name.startsWith('@') && name.includes('/')) {
    return name;
  }
  return name;
}

function resolveLocalPath(spec) {
  if (!spec || typeof spec !== 'string') return null;
  // file: URL or bare path
  let p = spec;
  if (p.startsWith('file:')) {
    p = p.slice('file:'.length);
    if (p.startsWith('//')) p = p.slice(2);
  }
  p = path.resolve(p);
  try {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      return p;
    }
  } catch (_) {
    /* ignore */
  }
  return null;
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

  const localPath = resolveLocalPath(spec);
  let manifest;
  let extractSpec = spec;
  let registryNote = null;

  if (localPath) {
    try {
      manifest = await fs.readJson(path.join(localPath, 'package.json'));
    } catch (err) {
      process.stderr.write(
        `cpm install: invalid local package at ${localPath}: ${err.message}\n`
      );
      return 1;
    }
  } else if (isBarePackageName(spec)) {
    // Phase 2: resolve Atom/Pulsar packages by name via registry, else npm.
    const { name: bareName, version: bareVer } = parseNameVersion(spec);
    try {
      const resolved = await resolveInstallSpec(bareName, bareVer);
      extractSpec = resolved.spec;
      registryNote = `${resolved.source} ${resolved.version} via registry`;
      process.stdout.write(
        `Resolved ${bareName}@${resolved.version} (${resolved.source})\n`
      );
      manifest = await pacote.manifest(extractSpec, {
        fullMetadata: true,
        Arborist
      });
    } catch (regErr) {
      try {
        manifest = await pacote.manifest(spec, { fullMetadata: true });
        extractSpec = spec;
        registryNote = 'npm registry fallback';
      } catch (err) {
        process.stderr.write(
          `cpm install: failed to resolve ${spec}: ${regErr.message}\n`
        );
        return 1;
      }
    }
  } else {
    try {
      manifest = await pacote.manifest(spec, {
        fullMetadata: true,
        Arborist
      });
    } catch (err) {
      process.stderr.write(
        `cpm install: failed to resolve ${spec}: ${err.message}\n`
      );
      return 1;
    }
  }

  const name = manifest.name;
  if (!name) {
    process.stderr.write(
      `cpm install: could not determine package name for ${spec}\n`
    );
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
  process.stdout.write(
    `Installing ${name}@${manifest.version || '?'} → ${dest}${
      registryNote ? ` (${registryNote})` : ''
    }\n`
  );

  if (await fs.pathExists(dest)) {
    await fs.remove(dest);
  }

  try {
    if (localPath) {
      // Copy tree; do not follow dest into itself. Skip node_modules if present
      // (reinstall deps via arborist for a clean tree).
      await fs.copy(localPath, dest, {
        filter: (src) => {
          const rel = path.relative(localPath, src);
          if (!rel || rel === '.') return true;
          const parts = rel.split(path.sep);
          if (parts.includes('node_modules')) return false;
          if (parts.includes('.git')) return false;
          return true;
        }
      });
    } else {
      await fs.ensureDir(dest);
      // pacote git/dir fetchers need the Arborist constructor when packing
      await pacote.extract(extractSpec, dest, { Arborist });
    }
  } catch (err) {
    process.stderr.write(`cpm install: extract failed: ${err.message}\n`);
    try {
      await fs.remove(dest);
    } catch (_) {
      /* ignore */
    }
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

  // Chevron #62: runtime Coffee/Babel transpile removed. Warn authors.
  try {
    const coffeeHits = await findCoffeeRuntimeFiles(dest);
    if (coffeeHits.length > 0) {
      process.stderr.write(
        'cpm install warning: package ships .coffee sources, but Chevron no longer ' +
          'runtime-transpiles CoffeeScript (issue #62). Precompile to .js before publish. ' +
          `Examples: ${coffeeHits.slice(0, 3).join(', ')}\n`
      );
    }
    const babelHits = await findBabelPrefixFiles(dest);
    if (babelHits.length > 0) {
      process.stderr.write(
        'cpm install warning: package ships Babel opt-in sources (/** @babel */ / \'use babel\' / @flow), ' +
          'but Chevron no longer runtime-transpiles them (issue #62). Precompile to plain JS. ' +
          `Examples: ${babelHits.slice(0, 3).join(', ')}\n`
      );
    }
  } catch (_) {
    /* non-fatal */
  }

  process.stdout.write(`Installed ${name}@${manifest.version || '?'}\n`);
  process.stdout.write(`Package home: ${getPackageHome()}\n`);
  return 0;
}

const BABEL_PREFIXES = [
  '/** @babel */',
  '"use babel"',
  "'use babel'",
  '/* @flow */',
  '// @flow'
];

/** Runtime-ish .coffee under lib/ or src/ (ignore specs and nested deps). */
async function findCoffeeRuntimeFiles(packageRoot, max = 8) {
  return walkPackageFiles(packageRoot, max, (rel, abs) => {
    if (!rel.endsWith('.coffee') && !abs.endsWith('.coffee')) return false;
    const top = rel.split(path.sep)[0];
    return top === 'lib' || top === 'src' || !rel.includes(path.sep);
  });
}

/** lib/src JS files that still use Atom Babel opt-in prefixes. */
async function findBabelPrefixFiles(packageRoot, max = 8) {
  return walkPackageFiles(packageRoot, max, (rel, abs) => {
    if (!abs.endsWith('.js')) return false;
    const top = rel.split(path.sep)[0];
    if (!(top === 'lib' || top === 'src')) return false;
    try {
      const fd = fs.openSync(abs, 'r');
      const buf = Buffer.alloc(120);
      const n = fs.readSync(fd, buf, 0, 120, 0);
      fs.closeSync(fd);
      const head = buf.slice(0, n).toString('utf8');
      return BABEL_PREFIXES.some(p => head.indexOf(p) === 0);
    } catch (_) {
      return false;
    }
  });
}

async function walkPackageFiles(packageRoot, max, predicate) {
  const hits = [];
  const skipDirs = new Set(['node_modules', 'spec', 'test', 'tests', '.git']);

  async function walk(dir) {
    if (hits.length >= max) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of entries) {
      if (hits.length >= max) return;
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skipDirs.has(ent.name)) continue;
        await walk(abs);
      } else if (ent.isFile()) {
        const rel = path.relative(packageRoot, abs);
        if (predicate(rel, abs)) hits.push(rel);
      }
    }
  }

  await walk(packageRoot);
  return hits;
}

module.exports = { installPackage, resolveLocalPath, packageDirName };
