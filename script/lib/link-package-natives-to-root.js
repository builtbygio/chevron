'use strict';

const fs = require('fs-extra');
const path = require('path');

/**
 * After a package-local `apm install --ignore-scripts`, nested native addons
 * may be present as source-only trees from the registry. Replace them with the
 * already-built, Electron-14-patched copies from the repo root so require()
 * resolution finds a working .node binary.
 *
 * @param {string} repoRoot
 * @param {string} packagePath  e.g. node_modules/github
 */
module.exports = function linkPackageNativesToRoot(repoRoot, packagePath) {
  const nativeRelPaths = [
    'superstring',
    'keytar',
    'tree-sitter',
    path.join('@atom', 'watcher')
  ];

  const packageNodeModules = path.join(packagePath, 'node_modules');
  if (!fs.existsSync(packageNodeModules)) {
    return;
  }

  for (const rel of nativeRelPaths) {
    const rootPkg = path.join(repoRoot, 'node_modules', rel);
    if (!fs.existsSync(rootPkg)) {
      continue;
    }

    const baseName = path.basename(rel);
    const scopedParent = rel.includes(path.sep) ? path.dirname(rel) : null;
    const matches = findPackageDirs(packageNodeModules, baseName, scopedParent);

    for (const match of matches) {
      if (path.resolve(match) === path.resolve(rootPkg)) {
        continue;
      }
      console.log(
        `  linking nested native ${rel} → ${path.relative(repoRoot, match)}`
      );
      fs.removeSync(match);
      fs.ensureDirSync(path.dirname(match));
      // Copy (dereference) so intermediate packaging does not depend on symlinks
      fs.copySync(rootPkg, match, { dereference: true });
    }
  }
};

function findPackageDirs(root, baseName, scopedParent) {
  const results = [];
  const stack = [root];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch (e) {
      continue;
    }

    for (const entry of entries) {
      if (entry === '.bin' || entry === 'build' || entry === 'vendor') {
        continue;
      }
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = fs.lstatSync(full);
      } catch (e) {
        continue;
      }
      if (!stat.isDirectory() && !stat.isSymbolicLink()) {
        continue;
      }

      if (entry === baseName) {
        if (scopedParent) {
          if (path.basename(dir) === path.basename(scopedParent)) {
            if (fs.existsSync(path.join(full, 'package.json'))) {
              results.push(full);
            }
          }
        } else if (fs.existsSync(path.join(full, 'package.json'))) {
          results.push(full);
        }
      }

      // Descend into nested node_modules and scoped packages
      if (entry === 'node_modules' || entry.startsWith('@') || entry === baseName) {
        if (stat.isDirectory() || stat.isSymbolicLink()) {
          try {
            // Follow one level of real dir for descent
            if (fs.statSync(full).isDirectory()) {
              stack.push(full);
            }
          } catch (e) {
            /* ignore broken links */
          }
        }
      } else if (path.basename(dir) === 'node_modules' && !entry.startsWith('.')) {
        // package folder — only descend into its node_modules
        const nestedNm = path.join(full, 'node_modules');
        if (fs.existsSync(nestedNm)) {
          stack.push(nestedNm);
        }
      }
    }
  }

  return results;
}
