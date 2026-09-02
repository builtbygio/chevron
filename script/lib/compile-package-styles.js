'use strict';

/**
 * Compile every bundled stylesheet to CSS at build time.
 *
 * Replaces prebuild-less-cache.js, which needed 16 passes because package
 * stylesheets read theme variables. They now read CSS custom properties, so a
 * stylesheet compiles to the same bytes under every theme and is compiled once.
 * See docs/reference/theme-custom-properties.md.
 *
 * What that removes downstream: the packaged app contains no .less at all, so
 * the runtime never compiles a stylesheet, never consults a less cache, and a
 * theme switch is a stylesheet swap rather than a recompile of the catalog.
 *
 * The .less files are deleted after compiling. That is not tidiness -- a
 * package's stylesheets are found with listSync(dir, ['css', 'less']), so
 * leaving both would load every stylesheet twice.
 *
 * Import paths, and why themes differ:
 *   non-theme  [static/variables, static]
 *   theme      [<its own>/styles, static/variables, static]
 * A theme's ui-variables.less has to resolve to its own copy rather than the
 * fallbacks, which is what makes its custom-properties.less emit that theme's
 * values. Nothing outside a theme needs a theme directory on the path: the
 * only cross-file theme imports (ui-variables-custom, colors, buttons) are
 * within the theme packages themselves.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const less = require('less');

const CONFIG = require('../config');

// Package stylesheets are compiled with the base variables in scope; static/
// stylesheets are not, matching what prebuild-less-cache did.
const FALLBACK_VARIABLE_IMPORTS =
  '@import "variables/ui-variables";\n@import "variables/syntax-variables";\n';

// less.render is promise-based, but with syncImport it invokes the callback
// synchronously -- the same way less-cache drives it. Keeping this synchronous
// keeps the build's step ordering as it was.
function renderSync(filePath, source, importPaths) {
  let css = null;
  let failure = null;
  less.render(
    source,
    { filename: filePath, syncImport: true, paths: importPaths },
    (error, result) => {
      if (error) failure = error;
      else css = result.css;
    }
  );
  if (failure) {
    failure.message = `${filePath}: ${failure.message}`;
    throw failure;
  }
  if (css === null) {
    throw new Error(`less did not render synchronously: ${filePath}`);
  }
  return css;
}

// glob patterns are forward-slash on every platform, and glob returns
// forward-slash paths even on Windows, where path.join produces backslashes.
// Mixing the two spellings silently breaks any comparison between them.
const pattern = p => p.split(path.sep).join('/');

// glob returns forward slashes even on Windows, where path.join produces
// backslashes, so the same file has two spellings and `a !== b` is true for
// both of them. That put a theme's index.less into the discard list as well as
// the compiled list, and the build died unlinking it twice -- on Windows only,
// because on Linux the two spellings are identical. Compare on one spelling.
const samePath = (a, b) => normalize(a) === normalize(b);
const normalize = p => p.split(/[\\/]/).join('/');

// Package styles only -- never compile a nested dependency's Less (github's
// node_modules/react-select uses mixins this pipeline does not provide).
function packageLessFiles(packageName) {
  const packageRoot = path.join(
    CONFIG.intermediateAppPath,
    'node_modules',
    packageName
  );
  return glob
    .sync(pattern(path.join(packageRoot, '**', '*.less')), {
      ignore: pattern(path.join(packageRoot, 'node_modules', '**', '*.less')),
      nodir: true
    })
    .map(file => path.resolve(file));
}

module.exports = function() {
  const appPath = CONFIG.intermediateAppPath;
  const staticPaths = [
    path.join(appPath, 'static', 'variables'),
    path.join(appPath, 'static')
  ];

  const themes = [];
  const packages = [];
  for (const packageName of Object.keys(
    CONFIG.appMetadata.packageDependencies
  )) {
    const metadata = require(path.join(
      appPath,
      'node_modules',
      packageName,
      'package.json'
    ));
    if (metadata.theme === 'ui' || metadata.theme === 'syntax') {
      themes.push(packageName);
    } else {
      packages.push(packageName);
    }
  }

  // Compile everything before writing anything. Stylesheets import each other
  // by relative path -- static/atom-ui/styles/private/forms.less pulls in
  // ../mixins/mixins -- so deleting a source as soon as it is compiled breaks
  // the imports of every file compiled after it.
  const results = [];
  const compileTo = (rawPath, importPaths, importFallbackVariables) => {
    const lessFilePath = path.resolve(rawPath);
    const source = fs.readFileSync(lessFilePath, 'utf8');
    const css = renderSync(
      lessFilePath,
      importFallbackVariables ? FALLBACK_VARIABLE_IMPORTS + source : source,
      importPaths
    );
    results.push({ lessFilePath, css });
  };

  // static/variables holds definitions, not stylesheets: compiling
  // ui-variables.less on its own emits nothing, so all four produced 0-byte
  // .css files and the .less originals were deleted with the rest.
  //
  // They have to survive. theme-manager prepends
  //   @import "variables/ui-variables";
  //   @import "variables/syntax-variables";
  // to the user stylesheet and to any package stylesheet compiled at run time,
  // so with the .less gone every one of those failed to compile in a packaged
  // build -- the user stylesheet on every launch.
  const isVariableDefinition = file =>
    normalize(path.resolve(file)).includes(
      normalize(path.join(appPath, 'static', 'variables')) + path.sep
    );

  for (const lessFilePath of glob
    .sync(pattern(path.join(appPath, 'static', '**', '*.less')))
    .map(file => path.resolve(file))
    .filter(file => !isVariableDefinition(file))) {
    compileTo(lessFilePath, staticPaths, false);
  }

  for (const packageName of packages) {
    for (const lessFilePath of packageLessFiles(packageName)) {
      compileTo(lessFilePath, staticPaths, true);
    }
  }

  // A theme has exactly one entry: index.less imports its partials in a fixed
  // order, and each partial depends on variables an earlier import established
  // -- styles/atom.less reads @scrollbar-background-color, which
  // styles/ui-variables-custom.less defines. So the partials cannot be
  // compiled standalone, and are simply dropped once index.css contains them.
  // prebuild-less-cache drew the same line: it compiled the theme main path
  // and only stashed the rest as sources.
  const discarded = [];
  for (const themeName of themes) {
    const themeRoot = path.join(appPath, 'node_modules', themeName);
    const ownStyles = path.join(themeRoot, 'styles');
    const indexPath = path.resolve(themeRoot, 'index.less');
    if (!fs.existsSync(indexPath)) {
      throw new Error(
        `theme ${themeName} has no index.less; its stylesheets have no entry ` +
          'point and cannot be compiled'
      );
    }
    compileTo(indexPath, [ownStyles, ...staticPaths], true);
    for (const lessFilePath of packageLessFiles(themeName)) {
      if (!samePath(lessFilePath, indexPath)) discarded.push(lessFilePath);
    }
  }

  const removed = new Set();
  const remove = lessFilePath => {
    const key = normalize(path.resolve(lessFilePath));
    if (removed.has(key)) return;
    removed.add(key);
    fs.unlinkSync(lessFilePath);
  };
  for (const { lessFilePath, css } of results) {
    fs.writeFileSync(lessFilePath.replace(/\.less$/, '.css'), css);
    remove(lessFilePath);
  }
  for (const lessFilePath of discarded) remove(lessFilePath);
  const compiled = results.length;

  // prebuild-less-cache published both of these for the runtime less cache to
  // avoid re-reading and re-digesting sources. With no .less shipped there is
  // nothing to publish, but the fields are still read, so they stay defined.
  CONFIG.snapshotAuxiliaryData.lessSourcesByRelativeFilePath = {};
  CONFIG.snapshotAuxiliaryData.importedFilePathsByRelativeImportPath = {};

  console.log(
    `Compiled ${compiled} stylesheets to CSS ` +
      `(${packages.length} packages, ${themes.length} themes, once each; ` +
      `${discarded.length} theme partials folded into their index)`
  );
};

// Exported for script/ci/compiled-styles.test.js.
module.exports.normalize = normalize;
module.exports.samePath = samePath;
