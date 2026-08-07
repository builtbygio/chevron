'use strict';

/**
 * CoffeeScript compile-cache entry (Option 2 / issue #62).
 *
 * Runtime `coffee-script` was removed from Chevron app dependencies after
 * converting the last bundled packages that shipped `lib/*.coffee`.
 * Community packages that still ship `.coffee` must precompile to JS.
 *
 * `CHEVRON_DISABLE_LEGACY_TRANSPILE` continues to refuse early for hardened
 * profiles (same as Babel 5). See docs/babel-coffee-isolation-plan.md.
 */

const crypto = require('crypto');
const path = require('path');

function legacyTranspileDisabled() {
  const v = process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function coffeeRemovedError(filePath) {
  return new Error(
    'CoffeeScript runtime transpile was removed from Chevron (issue #62). ' +
      'Precompile .coffee to .js before publishing the package. ' +
      'See docs/babel-coffee-isolation-plan.md. File: ' +
      filePath
  );
}

exports.shouldCompile = function() {
  // Always "should compile" so we never load raw Coffee as JS; compile() errors.
  // When hardened env is set, still refuse at shouldCompile for parity with Babel.
  if (legacyTranspileDisabled()) return false;
  return true;
};

exports.getCachePath = function(sourceCode) {
  return path.join(
    'coffee',
    crypto
      .createHash('sha1')
      .update(sourceCode, 'utf8')
      .digest('hex') + '.js'
  );
};

exports.compile = function(sourceCode, filePath) {
  if (legacyTranspileDisabled()) {
    throw new Error(
      'CoffeeScript transpile disabled (CHEVRON_DISABLE_LEGACY_TRANSPILE). ' +
        'Ship plain JS/TS; see docs/babel-coffee-isolation-plan.md. File: ' +
        filePath
    );
  }
  throw coffeeRemovedError(filePath);
};
