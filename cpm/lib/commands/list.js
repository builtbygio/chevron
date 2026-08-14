'use strict';

const fs = require('fs');
const path = require('path');
const { getPackageHome, getPackagesDirectory } = require('../paths');

function readPackageMeta(pkgPath) {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf8')
    );
    return {
      name: raw.name || path.basename(pkgPath),
      version: raw.version || '0.0.0',
      path: pkgPath,
      theme: raw.theme,
      repository: raw.repository
    };
  } catch (_) {
    return null;
  }
}

function readPackagesInDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const results = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const pkgPath = path.join(dir, name);
    let stat;
    try {
      stat = fs.statSync(pkgPath);
    } catch (_) {
      continue;
    }
    if (!stat.isDirectory()) continue;
    const meta = readPackageMeta(pkgPath);
    if (meta) results.push(meta);
  }
  return results;
}

function productPackageJsonCandidates() {
  const cpmRoot = path.join(__dirname, '..', '..');
  const repoRoot = path.join(cpmRoot, '..');
  const resources =
    typeof process.resourcesPath === 'string' ? process.resourcesPath : null;
  return [
    resources && path.join(resources, 'app.asar', 'package.json'),
    resources && path.join(resources, 'app', 'package.json'),
    path.join(repoRoot, 'package.json')
  ].filter(Boolean);
}

function readProductMetadata() {
  for (const candidate of productPackageJsonCandidates()) {
    try {
      if (fs.existsSync(candidate)) {
        return {
          json: JSON.parse(fs.readFileSync(candidate, 'utf8')),
          dir: path.dirname(candidate)
        };
      }
    } catch (_) {
      /* try next */
    }
  }
  return { json: {}, dir: null };
}

function corePackageDirs(productDir) {
  const dirs = [];
  if (productDir) {
    dirs.push(path.join(productDir, 'node_modules'));
  }
  if (typeof process.resourcesPath === 'string') {
    dirs.push(path.join(process.resourcesPath, 'app.asar', 'node_modules'));
    dirs.push(path.join(process.resourcesPath, 'app', 'node_modules'));
  }
  dirs.push(path.join(__dirname, '..', '..', '..', 'node_modules'));
  return dirs;
}

function readCorePackages() {
  const { json, dir } = readProductMetadata();
  const names = Object.keys(json.packageDependencies || {});
  if (names.length === 0) return [];
  const search = corePackageDirs(dir);
  const results = [];
  for (const name of names.sort()) {
    let meta = null;
    for (const root of search) {
      meta = readPackageMeta(path.join(root, name));
      if (meta) break;
    }
    results.push(
      meta || {
        name,
        version: String(json.packageDependencies[name] || '0.0.0'),
        path: null
      }
    );
  }
  return results;
}

function splitUserAndGit(packages) {
  const user = [];
  const git = [];
  for (const pack of packages) {
    if (pack.path && fs.existsSync(path.join(pack.path, '.git'))) {
      git.push(pack);
    } else {
      user.push(pack);
    }
  }
  return { user, git };
}

/**
 * apm `ls --json` shape used by settings-view:
 *   { user: [], core: [], dev: [], git: [] }
 */
function collectInstalled() {
  const home = getPackageHome();
  const { user, git } = splitUserAndGit(readPackagesInDir(getPackagesDirectory(home)));
  return {
    user,
    core: readCorePackages(),
    dev: readPackagesInDir(path.join(home, 'dev', 'packages')),
    git
  };
}

function listPackages({ json } = {}) {
  const grouped = collectInstalled();

  if (json) {
    process.stdout.write(JSON.stringify(grouped) + '\n');
    return 0;
  }

  const printGroup = (label, packs) => {
    console.log(`${label} (${packs.length})`);
    for (const p of packs) {
      console.log(`  ${p.name}@${p.version}`);
    }
  };
  printGroup('User', grouped.user);
  printGroup('Core', grouped.core);
  printGroup('Dev', grouped.dev);
  printGroup('Git', grouped.git);
  return 0;
}

module.exports = {
  listPackages,
  collectInstalled,
  readPackagesInDir,
  readPackageMeta
};
