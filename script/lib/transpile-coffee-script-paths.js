'use strict';

// Historically precompiled package CoffeeScript libs to JS for the packaged app.
// Option 2 (#62): CoffeeScript runtime and app dependency removed; remaining
// .coffee files are maintainer scripts or specs only. Skip transpile.
// Kept as a no-op so script/build call sites stay stable.

const CONFIG = require('../config');

module.exports = function() {
  console.log(
    `Skipping CoffeeScript transpile in ${CONFIG.intermediateAppPath} ` +
      '(coffee-script runtime removed; see docs/babel-coffee-isolation-plan.md)'
  );
};
