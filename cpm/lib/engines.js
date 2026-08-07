'use strict';

const path = require('path');
const semver = require('semver');

/**
 * Engine checks for engines.chevron (required product path) and engines.atom
 * (legacy only — Chevron-only product policy).
 *
 * When checking engines.atom, use ATOM_COMPAT_VERSION (default 1.65.0) so
 * honest Atom-era ranges can still install while we warn authors to add
 * engines.chevron.
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
  } else if (!engines.chevron && engines.atom) {
    warnings.push(
      'package declares engines.atom only; prefer engines.chevron (Chevron-only product policy)'
    );
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
    return process.env.CHEVRON_VERSION || process.env.ATOM_VERSION || null;
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
