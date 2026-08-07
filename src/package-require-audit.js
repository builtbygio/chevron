'use strict';

/**
 * Phase N3 + Phase S1: audit / restrict privileged and native requires
 * from package code.
 *
 * Env:
 *   CHEVRON_AUDIT_PACKAGE_REQUIRES=1     — log privileged/native requires (once each)
 *   CHEVRON_RESTRICT_PACKAGE_REQUIRES    — default ON (P1.2). 0/false/no disables.
 *       When on, throw for **community** packages only.
 *
 * Restrict never blocks:
 *   - core (src/, static/)
 *   - bundled packages inside the app (app.asar / resources/app)
 *   - monorepo packages/ when running with resource-path to the repo
 *
 * Restrict blocks community (T2) from:
 *   - privileged Node modules (fs, child_process, electron, …)
 *   - known native addon packages (superstring, keytar, …) — Phase S1.0
 *   - direct .node binding requires — Phase S1.0
 *
 * See docs/package-node-policy.md, docs/security-phase-s.md.
 */

const Module = require('module');
const path = require('path');
const {
  privilegedModuleIds,
  nativeAddonModuleIds
} = require('./preload-natives');

const PRIVILEGED = new Set(privilegedModuleIds);
const NATIVE_ADDONS = new Set(nativeAddonModuleIds);

function envFlag(name) {
  const v = process.env[name];
  return v === '1' || v === 'true' || v === 'yes';
}

function isAuditEnabled() {
  return envFlag('CHEVRON_AUDIT_PACKAGE_REQUIRES');
}

function isRestrictEnabled() {
  // Electron BP P1.2: default ON. Explicit 0/false/no disables.
  const v = process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  // Unset → restrict (hardening default). Main process sets env from config.
  return true;
}

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/');
}

/**
 * Extract a filesystem path from a V8 stack frame line.
 * Handles:
 *   at foo (/path/to/file.js:1:2)
 *   at /path/to/file.js:1:2
 *   webpack-style asar paths
 */
function pathFromStackLine(line) {
  if (!line) return null;
  const paren = line.match(/\((.+):\d+:\d+\)$/);
  if (paren) return paren[1];
  const bare = line.match(/^\s*at\s+(\/[^:]+):\d+:\d+$/);
  if (bare) return bare[1];
  const win = line.match(/\(([A-Za-z]:\\[^:]+):\d+:\d+\)$/);
  if (win) return win[1];
  return null;
}

function packageishCaller(stack) {
  if (!stack) return null;
  const lines = stack.split('\n');
  for (let i = 2; i < Math.min(lines.length, 16); i++) {
    const filePath = pathFromStackLine(lines[i]);
    if (!filePath) continue;
    const p = normalizePath(filePath);
    if (p.includes('/node_modules/') || p.includes('/packages/')) {
      return p;
    }
  }
  return null;
}

/**
 * Classify require call site for policy.
 * @returns {'core'|'bundled'|'community'|'unknown'}
 */
function classifyCallerPath(filePath) {
  if (!filePath) return 'unknown';
  const p = normalizePath(filePath);

  // Packaged app / asar — always bundled or core
  if (p.includes('.asar/') || p.includes('/resources/app/')) {
    return 'bundled';
  }

  // Dev monorepo: .../chevron/src or .../chevron/static
  if (/\/(src|static)\//.test(p) && !p.includes('/node_modules/')) {
    return 'core';
  }

  // Dev monorepo bundled packages: .../chevron/packages/<name>/
  if (/\/packages\/[^/]+\//.test(p) && !p.includes('/node_modules/')) {
    // Exclude user package homes that also end in /packages/
    if (
      p.includes('/.atom/packages/') ||
      p.includes('/.chevron/packages/') ||
      p.includes('/atom/packages/')
    ) {
      return 'community';
    }
    // Heuristic: path contains repo-ish segment before packages/
    return 'bundled';
  }

  // Explicit user package directories
  if (
    p.includes('/.atom/packages/') ||
    p.includes('/.chevron/packages/') ||
    /\/atom\/packages\//.test(p)
  ) {
    return 'community';
  }

  // node_modules outside asar while developing: treat as bundled dependency of core
  if (p.includes('/node_modules/')) {
    return 'bundled';
  }

  return 'unknown';
}

function baseModuleId(id) {
  if (typeof id !== 'string') return null;
  if (id.startsWith('.') || id.startsWith('/') || path.isAbsolute(id)) {
    return null;
  }
  if (id.startsWith('@')) {
    const parts = id.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : id;
  }
  return id.split('/')[0];
}

/** Direct native binding require (path ends with .node). */
function isNativeBindingId(id) {
  if (typeof id !== 'string') return false;
  const normalized = normalizePath(id).split('?')[0];
  return normalized.endsWith('.node');
}

/**
 * Classify a require id for policy.
 * @returns {'privileged'|'native-addon'|'native-binding'|null}
 */
function classifyRequireId(id) {
  if (isNativeBindingId(id)) return 'native-binding';
  const base = baseModuleId(id);
  if (!base) return null;
  if (PRIVILEGED.has(base)) return 'privileged';
  if (NATIVE_ADDONS.has(base)) return 'native-addon';
  return null;
}

function blockError(id, caller, kind, reason) {
  const msg =
    `[chevron-require-restrict] blocked require(${JSON.stringify(id)}) ` +
    `from community package (${caller || 'unknown'}) [${reason}]. ` +
    `Use atom.* APIs / cpm dual-support surfaces; see docs/package-node-policy.md ` +
    `and docs/security-phase-s.md. ` +
    `Set CHEVRON_RESTRICT_PACKAGE_REQUIRES=0 to disable.`;
  console.error(msg);
  const err = new Error(msg);
  err.code = 'CHEVRON_PRIVILEGED_REQUIRE_BLOCKED';
  err.chevronReason = reason;
  err.chevronCallerKind = kind;
  return err;
}

function installPackageRequireAudit() {
  const audit = isAuditEnabled();
  const restrict = isRestrictEnabled();
  if (!audit && !restrict) return false;
  if (global.__chevronRequireAuditInstalled) return true;
  global.__chevronRequireAuditInstalled = true;

  const original = Module.prototype.require;
  const seenLog = new Set();

  Module.prototype.require = function auditedRequire(id) {
    const reason = classifyRequireId(id);
    if (reason) {
      const probe = new Error();
      const caller = packageishCaller(probe.stack);
      const kind = classifyCallerPath(caller);

      if (audit && caller) {
        const key = `${caller}::${id}::${reason}`;
        if (!seenLog.has(key)) {
          seenLog.add(key);
          // S1.1: reason is privileged | native-addon | native-binding
          const surface =
            reason === 'native-addon' || reason === 'native-binding'
              ? 'native'
              : 'privileged';
          console.warn(
            `[chevron-require-audit] ${surface}/${reason} require(${JSON.stringify(
              id
            )}) from ${caller} (${kind})`
          );
        }
      }

      if (restrict && kind === 'community') {
        throw blockError(id, caller, kind, reason);
      }
    }
    return original.apply(this, arguments);
  };

  const modes = [];
  if (audit) modes.push('audit');
  if (restrict) modes.push('restrict-community');
  console.log(
    `[chevron-require-policy] enabled (${modes.join(
      '+'
    )}); privileged + native-addon block for community packages`
  );
  return true;
}

module.exports = {
  installPackageRequireAudit,
  isEnabled: isAuditEnabled,
  isAuditEnabled,
  isRestrictEnabled,
  classifyCallerPath,
  baseModuleId,
  isNativeBindingId,
  classifyRequireId,
  privilegedModuleIds: [...privilegedModuleIds],
  nativeAddonModuleIds: [...nativeAddonModuleIds]
};
