'use strict';

/**
 * Phase N3: optional audit of privileged requires from package code.
 *
 * Enable with env CHEVRON_AUDIT_PACKAGE_REQUIRES=1 (or "true").
 * Logs only — does not block. Used to inventory what still needs Atom APIs
 * / main IPC before a future require allowlist.
 */

const Module = require('module');
const path = require('path');
const {privilegedModuleIds} = require('./preload-natives');

const PRIVILEGED = new Set(privilegedModuleIds);

function isEnabled() {
  const v = process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES;
  return v === '1' || v === 'true' || v === 'yes';
}

function packageishCaller(stack) {
  if (!stack) return null;
  const lines = stack.split('\n');
  for (let i = 2; i < lines.length && i < 12; i++) {
    const line = lines[i];
    // node_modules/<pkg> or packages/<pkg>
    const m = line.match(
      /((?:node_modules|packages)[\\/][^)\\s]+)/
    );
    if (m) return m[1];
  }
  return null;
}

function baseModuleId(id) {
  if (typeof id !== 'string') return null;
  if (id.startsWith('.') || id.startsWith('/') || path.isAbsolute(id)) {
    return null;
  }
  // scoped: @atom/watcher → @atom/watcher; electron/remote → electron
  if (id.startsWith('@')) {
    const parts = id.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : id;
  }
  return id.split('/')[0];
}

function installPackageRequireAudit() {
  if (!isEnabled()) return false;
  if (global.__chevronRequireAuditInstalled) return true;
  global.__chevronRequireAuditInstalled = true;

  const original = Module.prototype.require;
  const seen = new Set();

  Module.prototype.require = function auditedRequire(id) {
    const base = baseModuleId(id);
    if (base && PRIVILEGED.has(base)) {
      const err = new Error();
      const caller = packageishCaller(err.stack);
      if (caller) {
        const key = `${caller}::${base}`;
        if (!seen.has(key)) {
          seen.add(key);
          console.warn(
            `[chevron-require-audit] privileged require(${JSON.stringify(
              id
            )}) from ${caller}`
          );
        }
      }
    }
    return original.apply(this, arguments);
  };

  console.log(
    '[chevron-require-audit] enabled (privileged package requires will be logged once each)'
  );
  return true;
}

module.exports = {
  installPackageRequireAudit,
  isEnabled,
  privilegedModuleIds: [...privilegedModuleIds]
};
