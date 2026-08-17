'use strict';

/**
 * Restricted module loader for package host v2 (Epic 21, slice 21.2).
 *
 * Runs inside the package-host utilityProcess. Community (T2) package code
 * loaded here gets:
 *
 *   - `require('chevron')` / `require('atom')` -> the stub proxy, never the
 *     real editor API (there is no editor in this process).
 *   - privileged Node ids, native addons and `.node` bindings -> hard throw,
 *     with no escape hatch. The in-process v1 policy
 *     (src/package-require-audit.js) can be disabled with
 *     CHEVRON_RESTRICT_PACKAGE_REQUIRES=0 because it protects a process that
 *     is privileged anyway. The host exists precisely so T2 code cannot reach
 *     these, so the block here is unconditional.
 *
 * Only files under a registered package root are restricted; the host's own
 * modules load normally.
 */

const Module = require('module');
const path = require('path');

const { classifyRequireId } = require('../../package-require-audit');

/** package root -> { name, stub } */
const registered = new Map();

let installed = false;
let originalRequire = null;

function normalize(p) {
  if (typeof p !== 'string' || p.length === 0) return null;
  try {
    return path.resolve(p);
  } catch (_) {
    return null;
  }
}

function isInside(child, parent) {
  if (!child || !parent) return false;
  const rel = path.relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Which registered package (if any) does this module file belong to?
 * @returns {{root: string, name: string, stub: object}|null}
 */
function ownerOf(filename) {
  const file = normalize(filename);
  if (!file) return null;
  for (const [root, entry] of registered) {
    if (file === root || isInside(file, root)) {
      return { root, name: entry.name, stub: entry.stub };
    }
  }
  return null;
}

function blocked(id, packageName, reason) {
  const err = new Error(
    `[chevron-package-host] blocked require(${JSON.stringify(id)}) from ` +
      `package "${packageName}" [${reason}]. The package host runs T2 code ` +
      `without privileged Node. Use the chevron.* API; see ` +
      `docs/package-node-policy.md and docs/security-phase-s-package-host.md.`
  );
  err.code = 'CHEVRON_HOST_REQUIRE_BLOCKED';
  err.chevronReason = reason;
  return err;
}

function registerPackage(root, name, stub) {
  const normalized = normalize(root);
  if (!normalized) throw new Error('registerPackage: bad root');
  registered.set(normalized, { name, stub });
  return normalized;
}

function unregisterPackage(root) {
  const normalized = normalize(root);
  if (!normalized) return false;
  return registered.delete(normalized);
}

/** Drop cached modules belonging to a package so re-activation re-reads them. */
function purgeModuleCache(root) {
  const normalized = normalize(root);
  if (!normalized) return 0;
  let n = 0;
  for (const key of Object.keys(require.cache)) {
    if (key === normalized || isInside(key, normalized)) {
      delete require.cache[key];
      n++;
    }
  }
  return n;
}

function install() {
  if (installed) return;
  installed = true;
  originalRequire = Module.prototype.require;

  Module.prototype.require = function chevronHostRequire(id) {
    const owner = ownerOf(this.filename);
    if (owner) {
      if (id === 'chevron' || id === 'atom') return owner.stub;
      const reason = classifyRequireId(id);
      if (reason) throw blocked(id, owner.name, reason);
    }
    return originalRequire.apply(this, arguments);
  };
}

function uninstall() {
  if (!installed) return;
  Module.prototype.require = originalRequire;
  installed = false;
}

module.exports = {
  install,
  uninstall,
  registerPackage,
  unregisterPackage,
  purgeModuleCache,
  ownerOf,
  isInstalled: () => installed
};
