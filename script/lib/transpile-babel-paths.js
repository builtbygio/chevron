'use strict';

const CompileCache = require('../../src/compile-cache');
const fs = require('fs');
const glob = require('glob');
const path = require('path');

const CONFIG = require('../config');

module.exports = function() {
  console.log(`Transpiling Babel paths in ${CONFIG.intermediateAppPath}`);
  for (let path of getPathsToTranspile()) {
    transpileBabelPath(path);
  }
};

function getPathsToTranspile() {
  let paths = [];
  for (let packageName of Object.keys(CONFIG.appMetadata.packageDependencies)) {
    const packageRoot = path.join(
      CONFIG.intermediateAppPath,
      'node_modules',
      packageName
    );
    paths = paths.concat(
      glob.sync(path.join(packageRoot, '**', '*.js'), {
        // Chevron: never Babel-transpile nested package dependencies
        // (e.g. github/node_modules/@babel/core uses modern syntax Babel 5 can't parse).
        ignore: [
          path.join(packageRoot, 'spec', '**', '*.js'),
          path.join(packageRoot, 'node_modules', '**', '*.js')
        ],
        nodir: true
      })
    );
  }
  return paths;
}

function transpileBabelPath(path) {
  fs.writeFileSync(
    path,
    CompileCache.addPathToCache(path, CONFIG.atomHomeDirPath)
  );
}
