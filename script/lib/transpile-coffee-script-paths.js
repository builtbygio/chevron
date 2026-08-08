'use strict';

// Historically precompiled package CoffeeScript libs to JS for the packaged app.
// Option 2 (#62): CoffeeScript runtime and app dependency removed; remaining
// .coffee files are maintainer scripts or specs only. Skip transpile.
// Kept as a no-op so script/build call sites stay stable.

const CONFIG = require('../config');

module.exports = function() {
  // Stream C: silent no-op (coffee-script runtime removed, #62).
  // Kept as a call site so script/build stays stable; no log spam.
  void CONFIG;
};
