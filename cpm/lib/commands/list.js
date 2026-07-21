'use strict';

const fs = require('fs');
const path = require('path');
const { getPackagesDirectory } = require('../paths');

function listPackages({ json } = {}) {
  const packagesDir = getPackagesDirectory();
  const results = [];

  if (!fs.existsSync(packagesDir)) {
    if (json) {
      process.stdout.write(JSON.stringify([]) + '\n');
    } else {
      console.log(`No packages directory at ${packagesDir}`);
    }
    return 0;
  }

  for (const name of fs.readdirSync(packagesDir).sort()) {
    const pkgPath = path.join(packagesDir, name);
    if (!fs.statSync(pkgPath).isDirectory()) continue;
    let version = '?';
    try {
      version = require(path.join(pkgPath, 'package.json')).version || '?';
    } catch (_) {
      /* ignore */
    }
    results.push({ name, version, path: pkgPath });
  }

  if (json) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    if (results.length === 0) {
      console.log(`(empty) ${packagesDir}`);
    } else {
      for (const p of results) {
        console.log(`${p.name}@${p.version}`);
      }
    }
  }
  return 0;
}

module.exports = { listPackages };
