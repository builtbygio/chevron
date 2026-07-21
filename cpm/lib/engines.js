'use strict';

const semver = require('semver');

/**
 * Soft/hard engine checks for engines.atom and engines.chevron.
 * Dual-support: engines.atom remains the ecosystem default.
 */
function checkEngines(manifest, productVersion, options = {}) {
  const strict = Boolean(options.strict);
  const engines = (manifest && manifest.engines) || {};
  const warnings = [];
  const errors = [];

  if (engines.chevron && productVersion) {
    if (!semver.satisfies(semver.coerce(productVersion), engines.chevron, {
      includePrerelease: true
    })) {
      const msg = `engines.chevron ${engines.chevron} not satisfied by ${productVersion}`;
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
  }

  if (engines.atom && productVersion) {
    // Atom engines historically track Atom product version; Chevron dual-supports
    // by treating our version as compatible when engines.atom is present unless strict.
    if (
      !semver.satisfies(semver.coerce(productVersion), engines.atom, {
        includePrerelease: true
      })
    ) {
      const msg = `engines.atom ${engines.atom} not satisfied by product ${productVersion} (dual-support: continuing unless --strict)`;
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
  }

  return { warnings, errors, ok: errors.length === 0 };
}

function getProductVersion() {
  try {
    return require(pathJoinRootPackage()).version;
  } catch (_) {
    return process.env.ATOM_VERSION || process.env.CHEVRON_VERSION || null;
  }
}

function pathJoinRootPackage() {
  const path = require('path');
  return path.join(__dirname, '..', '..', 'package.json');
}

module.exports = { checkEngines, getProductVersion };
