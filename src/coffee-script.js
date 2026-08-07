'use strict';

const crypto = require('crypto');
const path = require('path');
let CoffeeScript = null;
let deprecationLogged = false;

function legacyTranspileDisabled() {
  const v = process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

exports.shouldCompile = function() {
  // Option 1 isolation: refuse Coffee when hardened profile is on.
  // See docs/babel-coffee-isolation-plan.md.
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

  if (!CoffeeScript) {
    const previousPrepareStackTrace = Error.prepareStackTrace;
    CoffeeScript = require('coffee-script');

    // When it loads, coffee-script reassigns Error.prepareStackTrace. We have
    // already reassigned it via the 'source-map-support' module, so we need
    // to set it back.
    Error.prepareStackTrace = previousPrepareStackTrace;
  }

  if (!deprecationLogged) {
    deprecationLogged = true;
    console.warn(
      '[chevron] CoffeeScript compile-cache is legacy (coffee-script 1.12). ' +
        'Prefer precompiled JS/TS. Set CHEVRON_DISABLE_LEGACY_TRANSPILE=1 to refuse. ' +
        'See docs/babel-coffee-isolation-plan.md. First file: ' +
        filePath
    );
  }

  if (process.platform === 'win32') {
    filePath = 'file:///' + path.resolve(filePath).replace(/\\/g, '/');
  }

  const output = CoffeeScript.compile(sourceCode, {
    filename: filePath,
    sourceFiles: [filePath],
    inlineMap: true
  });

  // Strip sourceURL from output so there wouldn't be duplicate entries
  // in devtools.
  return output.replace(/\/\/# sourceURL=[^'"\n]+\s*$/, '');
};
