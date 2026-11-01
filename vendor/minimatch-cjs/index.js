'use strict';

// minimatch 9+ exports a namespace object. Legacy callers (glob@7 under
// rimraf/fs-plus) still do `const minimatch = require('minimatch'); minimatch(p, pat)`
// and also read `.Minimatch` off that same value. Re-export the matcher function
// with the namespace properties copied onto it.
const core = require('minimatch-core');
const fn = core.minimatch;
Object.assign(fn, core);
module.exports = fn;
