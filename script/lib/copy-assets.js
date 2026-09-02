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
    path.join(CONFIG.repositoryRootPath, 'dot-chevron'),
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

  preserveNestedModules();

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

  copyOwnedCatalog();
};

// The owned catalog, shipped as payloads rather than as packages.
//
// These are not in packageDependencies and are not loaded: nothing activates
// them and nothing requires them. They are here so the Install panel has
// something to install from, because there is no published registry yet and a
// packaged app has no packages/ directory to point cpm at.
//
// The cost is the source only -- about 100 KB for all six. What makes a
// language server large arrives at install time: npm dependencies, or a
// prebuilt binary, or nothing at all when the machine already has one.
function copyOwnedCatalog() {
  const source = path.join(CONFIG.repositoryRootPath, 'packages');
  const destination = path.join(CONFIG.intermediateAppPath, 'catalog');
  let entries;
  try {
    entries = fs.readdirSync(source);
  } catch (error) {
    return;
  }

  const shipped = new Set(
    Object.keys(CONFIG.appMetadata.packageDependencies || {})
  );
  let copied = 0;
  for (const name of entries) {
    if (!/^chevron-lsp-/.test(name)) continue;
    // A bundled package is already in the app; offering to install it would
    // be wrong, and the catalog test asserts none of these is bundled.
    if (shipped.has(name)) continue;
    if (!fs.existsSync(path.join(source, name, 'package.json'))) continue;
    fs.copySync(path.join(source, name), path.join(destination, name), {
      filter: src =>
        !['node_modules', 'server', 'bin'].includes(path.basename(src))
    });
    copied++;
  }
  if (copied) {
    console.log(`Copied ${copied} owned catalog packages to catalog/`);
  }
}

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

// pnpm nests a dependency under the package that needs it whenever the hoisted
// version does not satisfy that package's range. The copy pass above walks the
// top-level entries only, so those nested copies were left behind and every
// package fell back to the single hoisted version.
//
// That broke things silently and only in the packaged app, because the dev
// tree resolves correctly. markdown-preview was the case that surfaced:
// htmlparser2 needs entities ^7, the app shipped 4.5.0, and opening a preview
// said "Previewing Markdown Failed" while the same code worked in dev.
//
// It was being patched one casualty at a time -- tree-view/minimatch,
// language-css/tree-sitter-css, htmlparser2/entities, parse5/entities. Across
// the tree there are 126 dependencies whose hoisted replacement does not
// satisfy the declared range, 36 of them in packages the editor actually
// loads, so naming them individually was never going to finish.
//
// This copies what pnpm resolved instead of re-deciding it.
function preserveNestedModules() {
  const sourceRoot = path.join(CONFIG.repositoryRootPath, 'node_modules');
  const destRoot = path.join(CONFIG.intermediateAppPath, 'node_modules');
  let copied = 0;

  const realPathOf = entry => {
    try {
      return fs.realpathSync(entry);
    } catch (_) {
      return null;
    }
  };

  // Scoped packages live one level down: @scope/name.
  const topLevelPackages = [];
  for (const entry of fs.readdirSync(sourceRoot)) {
    if (entry.startsWith('.')) continue;
    if (entry.startsWith('@')) {
      let scoped;
      try {
        scoped = fs.readdirSync(path.join(sourceRoot, entry));
      } catch (_) {
        continue;
      }
      for (const name of scoped) topLevelPackages.push(path.join(entry, name));
    } else {
      topLevelPackages.push(entry);
    }
  }

  for (const packageName of topLevelPackages) {
    const resolved = realPathOf(path.join(sourceRoot, packageName));
    if (!resolved) continue;
    const nestedRoot = path.join(resolved, 'node_modules');
    let nestedEntries;
    try {
      if (!fs.statSync(nestedRoot).isDirectory()) continue;
      nestedEntries = fs.readdirSync(nestedRoot);
    } catch (_) {
      continue;
    }

    for (const nestedName of nestedEntries) {
      // .bin holds shims that point outside the tree; asar cannot follow them
      // and nothing in the app runs them.
      if (nestedName.startsWith('.')) continue;
      const names = nestedName.startsWith('@')
        ? fs
            .readdirSync(path.join(nestedRoot, nestedName))
            .map(inner => path.join(nestedName, inner))
        : [nestedName];

      for (const name of names) {
        const dest = path.join(destRoot, packageName, 'node_modules', name);
        if (fs.existsSync(dest)) continue;
        const src = realPathOf(path.join(nestedRoot, name));
        if (!src) continue;
        // Copy rather than symlink: asar stores a symlink as a single entry
        // with no children, so require() from the parent finds nothing.
        copyModuleTree(src, dest);
        copied++;
      }
    }
  }

  console.log(`Preserved ${copied} nested dependencies pnpm had resolved`);
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
