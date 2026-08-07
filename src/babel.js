'use strict';

// Babel compile-cache entry (Option 3 / issue #62).
// Runtime babel-core@5 removed after precompiling babel-prefix sources in
// bundled packages (owned forks + monorepo packages + atom/* patches).
// Community packages that still ship @babel / use-babel / Flow opt-in must
// precompile to plain JS/TS. See docs/babel-coffee-isolation-plan.md.


const crypto = require('crypto');
const path = require('path');

const PREFIXES = [
  '/** @babel */',
  '"use babel"',
  "'use babel'",
  '/* @flow */',
  '// @flow'
];

const PREFIX_LENGTH = Math.max.apply(
  Math,
  PREFIXES.map(function(prefix) {
    return prefix.length;
  })
);

function legacyTranspileDisabled() {
  const v = process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function babelRemovedError(filePath) {
  return new Error(
    'Babel runtime transpile was removed from Chevron (issue #62). ' +
      'Precompile /** @babel */ / \'use babel\' / Flow sources to plain JS before publishing. ' +
      'See docs/babel-coffee-isolation-plan.md. File: ' +
      filePath
  );
}

exports.shouldCompile = function(sourceCode) {
  if (legacyTranspileDisabled()) return false;
  const start = sourceCode.substr(0, PREFIX_LENGTH);
  const matches = PREFIXES.some(function(prefix) {
    return start.indexOf(prefix) === 0;
  });
  // If prefix matches, still "should compile" so we never load raw ESM/JSX as JS;
  // compile() throws the migration error.
  return matches;
};

exports.getCachePath = function(sourceCode) {
  // Stable path prefix without requiring babel-core package.json
  return path.join(
    'js',
    'babel-removed',
    crypto
      .createHash('sha1')
      .update(sourceCode, 'utf8')
      .digest('hex') + '.js'
  );
};

exports.compile = function(sourceCode, filePath) {
  if (legacyTranspileDisabled()) {
    throw new Error(
      'Babel legacy transpile disabled (CHEVRON_DISABLE_LEGACY_TRANSPILE). ' +
        'Ship plain JS/TS; see docs/babel-coffee-isolation-plan.md. File: ' +
        filePath
    );
  }
  throw babelRemovedError(filePath);
};
