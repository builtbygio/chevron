'use strict';

/**
 * Historically precompiled package babel-prefix JS for the packaged app.
 * Option 3 (#62): runtime babel-core removed; bundled sources precompiled
 * offline (owned forks, monorepo packages, atom/* patches). No-op at build.
 */

const CONFIG = require('../config');

module.exports = function() {
  console.log(
    `Skipping Babel transpile in ${CONFIG.intermediateAppPath} ` +
      '(babel-core runtime removed; see docs/babel-coffee-isolation-plan.md)'
  );
};
