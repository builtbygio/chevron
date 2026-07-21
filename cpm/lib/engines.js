'use strict';

const path = require('path');
const semver = require('semver');

/**
 * Soft/hard engine checks for engines.atom and engines.chevron.
 * Dual-support: packages still declare engines.atom for Atom 1.x.
 * When checking engines.atom, use ATOM_COMPAT_VERSION (default 1.65.0)
 * so honest Atom packages do not warn/fail on Chevron 0.x versions.
 */
const DEFAULT_ATOM_COMPAT_VERSION = '1.65.0';

function checkEngines(manifest, productVersion, options = {}) {
  const strict = Boolean(options.strict);
  const engines = (manifest && manifest.engines) || {};
  const warnings = [];
  const errors = [];
  const atomCompat =
    options.atomCompatVersion ||
    process.env.ATOM_COMPAT_VERSION ||
    DEFAULT_ATOM_COMPAT_VERSION;

  if (engines.chevron && productVersion) {
    const v = semver.coerce(productVersion);
    if (v && !semver.satisfies(v, engines.chevron, { includePrerelease: true })) {
      const msg = `engines.chevron ${engines.chevron} not satisfied by ${productVersion}`;
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
  }

  if (engines.atom) {
    const v = semver.coerce(atomCompat);
    if (v && !semver.satisfies(v, engines.atom, { includePrerelease: true })) {
      const msg = `engines.atom ${engines.atom} not satisfied by Atom-compat ${atomCompat}`;
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
  }

  return { warnings, errors, ok: errors.length === 0, atomCompat };
}

function getProductVersion() {
  try {
    return require(pathJoinRootPackage()).version;
  } catch (_) {
    return process.env.ATOM_VERSION || process.env.CHEVRON_VERSION || null;
  }
}

function pathJoinRootPackage() {
  return path.join(__dirname, '..', '..', 'package.json');
}

module.exports = {
  checkEngines,
  getProductVersion,
  DEFAULT_ATOM_COMPAT_VERSION
};
