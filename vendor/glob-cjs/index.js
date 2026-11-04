'use strict';

// glob 9+ is a namespace: `require('glob')` is not callable, and the callback
// form is gone. rimraf and fs-plus still call `glob(pattern, cb)` and
// `glob.sync`, and some wrap it with util.promisify. This file is that
// function, with the glob 14 namespace copied onto it.
const { promisify } = require('util');
const { createRequire } = require('module');
const path = require('path');

let core;
try {
  core = require('glob-core');
} catch (error) {
  const fromRoot = createRequire(path.join(__dirname, '..', '..', 'package.json'));
  core = fromRoot('glob-core');
}

function glob(pattern, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  const pending = core.glob(pattern, options);
  if (typeof callback !== 'function') return pending;
  pending.then(matches => callback(null, matches), err => callback(err));
}

Object.assign(glob, core);
glob.sync = core.globSync;
glob[promisify.custom] = function(pattern, options) {
  return core.glob(pattern, options);
};

module.exports = glob;
// Static assignments so ESM `import * as glob` (mocha 12) sees these names.
module.exports.sync = glob.sync;
module.exports.hasMagic = core.hasMagic;
module.exports.glob = core.glob;
module.exports.globSync = core.globSync;
module.exports.Glob = core.Glob;
