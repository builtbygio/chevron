'use strict';

/**
 * Compile package (and app) .ts/.tsx to .js for the intermediate app tree.
 * Mirrors transpile-coffee-script-paths.js so generate-metadata can
 * require.resolve extensionless package mains (Node only resolves .js by default).
 */

const CompileCache = require('../../src/compile-cache');
const fs = require('fs');
const glob = require('glob');
const path = require('path');

const CONFIG = require('../config');

module.exports = function() {
  console.log(
    `Transpiling TypeScript paths in ${CONFIG.intermediateAppPath}`
  );
  for (let filePath of getPathsToTranspile()) {
    transpileTypeScriptPath(filePath);
  }
};

function getPathsToTranspile() {
  let paths = [];
  paths = paths.concat(
    glob.sync(path.join(CONFIG.intermediateAppPath, 'src', '**', '*.ts'), {
      nodir: true
    })
  );
  paths = paths.concat(
    glob.sync(path.join(CONFIG.intermediateAppPath, 'src', '**', '*.tsx'), {
      nodir: true
    })
  );
  for (let packageName of Object.keys(CONFIG.appMetadata.packageDependencies)) {
    const packageRoot = path.join(
      CONFIG.intermediateAppPath,
      'node_modules',
      packageName
    );
    paths = paths.concat(
      glob.sync(path.join(packageRoot, '**', '*.ts'), {
        ignore: [
          path.join(packageRoot, 'spec', '**', '*.ts'),
          path.join(packageRoot, 'node_modules', '**', '*.ts')
        ],
        nodir: true
      })
    );
    paths = paths.concat(
      glob.sync(path.join(packageRoot, '**', '*.tsx'), {
        ignore: [
          path.join(packageRoot, 'spec', '**', '*.tsx'),
          path.join(packageRoot, 'node_modules', '**', '*.tsx')
        ],
        nodir: true
      })
    );
  }
  return paths;
}

function transpileTypeScriptPath(tsPath) {
  const jsPath = tsPath.replace(/\.tsx?$/i, '.js');
  fs.writeFileSync(
    jsPath,
    CompileCache.addPathToCache(tsPath, CONFIG.atomHomeDirPath)
  );
  fs.unlinkSync(tsPath);
}
