// This module exports a function that copies all the static assets into the
// appropriate location in the build output directory.

'use strict';

const path = require('path');
const fs = require('fs-extra');
const CONFIG = require('../config');
const glob = require('glob');
const includePathInPackagedApp = require('./include-path-in-packaged-app');

module.exports = function() {
  console.log(`Copying assets to ${CONFIG.intermediateAppPath}`);
  let srcPaths = [
    path.join(CONFIG.repositoryRootPath, 'benchmarks', 'benchmark-runner.js'),
    path.join(CONFIG.repositoryRootPath, 'dot-atom'),
    path.join(CONFIG.repositoryRootPath, 'exports'),
    path.join(CONFIG.repositoryRootPath, 'package.json'),
    path.join(CONFIG.repositoryRootPath, 'static'),
    path.join(CONFIG.repositoryRootPath, 'src'),
    path.join(CONFIG.repositoryRootPath, 'vendor')
  ];
  srcPaths = srcPaths.concat(
    glob.sync(path.join(CONFIG.repositoryRootPath, 'spec', '*.*'), {
      ignore: path.join('**', '*-spec.*')
    })
  );
  for (let srcPath of srcPaths) {
    fs.copySync(srcPath, computeDestinationPath(srcPath), {
      filter: includePathInPackagedApp
    });
  }

  // Run a copy pass to dereference symlinked directories under node_modules.
  // We do this to ensure that symlinked repo-local bundled packages get
  // copied to the output folder correctly.  We dereference only the top-level
  // symlinks and not nested symlinks to avoid issues where symlinked binaries
  // are duplicated in Atom's installation packages (see atom/atom#18490).
  const nodeModulesPath = path.join(CONFIG.repositoryRootPath, 'node_modules');
  glob
    .sync(path.join(nodeModulesPath, '*'))
    .map(p =>
      fs.lstatSync(p).isSymbolicLink()
        ? path.resolve(nodeModulesPath, fs.readlinkSync(p))
        : p
    )
    .forEach(modulePath => {
      const destPath = path.join(
        CONFIG.intermediateAppPath,
        'node_modules',
        path.basename(modulePath)
      );
      fs.copySync(modulePath, destPath, { filter: includePathInPackagedApp });
    });

  // AtomNova: force-patched natives may leave nested absolute symlinks
  // (e.g. text-buffer/node_modules/superstring → repo root). asar cannot
  // pack links that escape the app directory — materialize them as copies.
  materializeExternalSymlinks(
    path.join(CONFIG.intermediateAppPath, 'node_modules')
  );

  fs.copySync(
    path.join(
      CONFIG.repositoryRootPath,
      'resources',
      'app-icons',
      CONFIG.channel,
      'png',
      '1024.png'
    ),
    path.join(CONFIG.intermediateAppPath, 'resources', 'atom.png')
  );
};

function materializeExternalSymlinks(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  const rootResolved = path.resolve(rootDir);
  const stack = [rootDir];

  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch (e) {
      continue;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry);
      let stat;
      try {
        stat = fs.lstatSync(full);
      } catch (e) {
        continue;
      }

      if (stat.isSymbolicLink()) {
        let target;
        try {
          target = fs.realpathSync(full);
        } catch (e) {
          // Broken link — drop it so packaging does not fail later
          fs.removeSync(full);
          continue;
        }
        const targetResolved = path.resolve(target);
        // If the link target is outside the intermediate node_modules tree,
        // replace the symlink with a real copy (required for asar).
        if (
          targetResolved !== full &&
          !targetResolved.startsWith(rootResolved + path.sep) &&
          targetResolved !== rootResolved
        ) {
          console.log(
            `  materializing external symlink ${path.relative(
              CONFIG.intermediateAppPath,
              full
            )}`
          );
          fs.removeSync(full);
          fs.copySync(targetResolved, full, { dereference: true });
        } else if (fs.statSync(full).isDirectory()) {
          stack.push(full);
        }
      } else if (stat.isDirectory()) {
        stack.push(full);
      }
    }
  }
}

function computeDestinationPath(srcPath) {
  const relativePath = path.relative(CONFIG.repositoryRootPath, srcPath);
  return path.join(CONFIG.intermediateAppPath, relativePath);
}
