'use strict';

/**
 * PR 14: first-mate (and thus oniguruma) stay wrapped. Do not require
 * them at GrammarRegistry / TextEditor boot. A tree-sitter-only session
 * should not load the NAN addon. Does not delete first-mate.
 */

let firstMate = null;

function loadFirstMate() {
  if (!firstMate) firstMate = require('first-mate');
  return firstMate;
}

function isFirstMateLoaded() {
  return firstMate != null;
}

module.exports = { loadFirstMate, isFirstMateLoaded };
