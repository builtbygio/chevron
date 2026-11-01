'use strict';

const { glob } = require('glob');

module.exports = function(globPaths) {
  return Promise.all(globPaths.map(g => expandGlobPath(g))).then(paths =>
    paths.reduce((a, b) => a.concat(b), [])
  );
};

function expandGlobPath(globPath) {
  // glob 9+ dropped the callback form; glob() returns a Promise.
  return glob(globPath);
}
