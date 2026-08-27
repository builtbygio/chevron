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
      // fs-extra copySync stats through symlinks. pnpm's hoisted
      // node_modules/.bin stubs are often dangling; skip them.
      copyModuleTree(modulePath, destPath);
    });

  nestHoistedDep('tree-view', 'minimatch');
  // language-css wants tree-sitter-css 0.23.2 (prebuilds). pnpm may hoist
  // 0.20.0 from tree-sitter-less/scss, which has no native binding.
  nestPackageDep('language-css', 'tree-sitter-css');

  // Chevron: force-patched natives may leave nested absolute symlinks
  // (e.g. text-buffer/node_modules/superstring → repo root). asar cannot
  // pack links that escape the app directory — materialize them as copies.
  materializeExternalSymlinks(
    path.join(CONFIG.intermediateAppPath, 'node_modules')
  );

  // Window/taskbar icons: ship multi-size PNGs with true alpha. Prefer 256 as
  // the legacy atom.png/chevron.png name (1024 alone is a poor dock icon).
  const channelPngDir = path.join(
    CONFIG.repositoryRootPath,
    'resources',
    'app-icons',
    CONFIG.channel,
    'png'
  );
  const appResourcesDir = path.join(CONFIG.intermediateAppPath, 'resources');
  const appIconsDir = path.join(appResourcesDir, 'icons');
  fs.mkdirpSync(appIconsDir);

  const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  for (const size of iconSizes) {
    const src = path.join(channelPngDir, `${size}.png`);
    if (fs.existsSync(src)) {
      fs.copySync(src, path.join(appIconsDir, `${size}.png`));
    }
  }

  const primaryIcon = [
    path.join(channelPngDir, '256.png'),
    path.join(channelPngDir, '128.png'),
    path.join(channelPngDir, '1024.png')
  ].find(p => fs.existsSync(p));
  if (primaryIcon) {
    fs.copySync(primaryIcon, path.join(appResourcesDir, 'atom.png'));
    fs.copySync(primaryIcon, path.join(appResourcesDir, 'chevron.png'));
  }
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

function nestHoistedDep(packageName, depName) {
  nestPackageDep(packageName, depName);
}

function nestPackageDep(packageName, depName) {
  const destRoot = path.join(CONFIG.intermediateAppPath, 'node_modules');
  const nested = path.join(destRoot, packageName, 'node_modules', depName);
  const srcNested = path.join(
    CONFIG.repositoryRootPath,
    'node_modules',
    packageName,
    'node_modules',
    depName
  );
  const hoisted = path.join(destRoot, depName);
  const src = fs.existsSync(srcNested) ? srcNested : hoisted;
  if (!fs.existsSync(src) || fs.existsSync(nested)) return;
  // Copy, do not symlink: asar stores a symlink as a single entry without
  // child files, so require() from tree-view cannot load minimatch.js.
  copyModuleTree(src, nested);
}

function copyModuleTree(src, dest) {
  if (!includePathInPackagedApp(src)) return;
  let srcStat;
  try {
    srcStat = fs.lstatSync(src);
  } catch (_) {
    return;
  }
  if (srcStat.isSymbolicLink()) {
    let target;
    try {
      fs.statSync(src);
      target = fs.readlinkSync(src);
    } catch (_) {
      return;
    }
    fs.mkdirpSync(path.dirname(dest));
    fs.symlinkSync(target, dest);
    return;
  }
  if (srcStat.isDirectory()) {
    fs.mkdirpSync(dest);
    for (const name of fs.readdirSync(src)) {
      if (name === '.bin') continue;
      // pnpm may nest a second copy of atom-select-list etc. Those copies
      // cannot resolve require('atom') / require('chevron'). Use the hoisted
      // tree instead. Native .node files live in <pkg>/build, not here.
      if (name === 'node_modules') continue;
      copyModuleTree(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.copySync(src, dest);
}

function computeDestinationPath(srcPath) {
  const relativePath = path.relative(CONFIG.repositoryRootPath, srcPath);
  return path.join(CONFIG.intermediateAppPath, relativePath);
}
