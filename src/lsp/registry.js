'use strict';

/**
 * Server registration registry (Phase 3).
 * Precedence: package-registered > user config > built-in table.
 * See docs/lsp-design.md §5.5.
 */

// No event-kit here — unit CI runs without root node_modules.
const { resolveBuiltinRegistrations, which } = require('./builtin-servers');

function disposable(fn) {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        fn();
      } catch (_) {
        /* ignore */
      }
    }
  };
}

/** @typedef {{
 *   id: string,
 *   scopes: string[],
 *   command: string,
 *   args?: string[],
 *   initializationOptions?: object,
 *   source: 'package'|'user'|'builtin',
 *   env?: object
 * }} ServerRegistration */

/** @type {Map<string, ServerRegistration>} id -> registration */
const packageRegs = new Map();

/**
 * Normalize a registration object from a package.
 * @param {object} spec
 * @returns {ServerRegistration}
 */
function normalizePackageSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error('chevron.lsp.registerServer requires a spec object');
  }
  const id = spec.id || spec.serverId;
  if (!id || typeof id !== 'string') {
    throw new Error('registerServer: id is required');
  }
  const scopes = Array.isArray(spec.scopes)
    ? spec.scopes
    : spec.scope
      ? [spec.scope]
      : [];
  if (scopes.length === 0) {
    throw new Error('registerServer: scopes[] is required');
  }
  if (!spec.command || typeof spec.command !== 'string') {
    throw new Error('registerServer: command is required');
  }
  return {
    id,
    scopes: scopes.slice(),
    command: spec.command,
    args: Array.isArray(spec.args) ? spec.args.slice() : [],
    initializationOptions: spec.initializationOptions || {},
    env: spec.env,
    source: 'package'
  };
}

/**
 * Register a server from an owned package (or later host-v2 package).
 * @param {object} spec
 * @returns {Disposable}
 */
function registerServer(spec) {
  const reg = normalizePackageSpec(spec);
  packageRegs.set(reg.id, reg);
  return disposable(() => {
    const cur = packageRegs.get(reg.id);
    if (cur === reg || (cur && cur.id === reg.id)) {
      packageRegs.delete(reg.id);
    }
  });
}

/**
 * User config: atom.config / chevron.config `lsp.servers`
 * Shape: { "source.rust": { command, args?, initializationOptions? }, ... }
 * or { "rust-analyzer": { scopes: [...], command, ... } }
 * @returns {ServerRegistration[]}
 */
function loadUserRegistrations() {
  const env = global.chevron || global.atom;
  if (!env || !env.config || typeof env.config.get !== 'function') return [];
  let servers;
  try {
    servers = env.config.get('lsp.servers');
  } catch (_) {
    return [];
  }
  if (!servers || typeof servers !== 'object') return [];

  const out = [];
  for (const [key, value] of Object.entries(servers)) {
    if (!value || typeof value !== 'object') continue;
    if (typeof value.command !== 'string') continue;

    let scopes;
    let id;
    if (Array.isArray(value.scopes) && value.scopes.length) {
      scopes = value.scopes;
      id = value.id || key;
    } else if (key.startsWith('source.') || key.startsWith('text.')) {
      scopes = [key];
      id = value.id || `user:${key}`;
    } else {
      scopes = value.scope ? [value.scope] : [];
      id = value.id || key;
    }
    if (!scopes.length) continue;

    out.push({
      id: String(id),
      scopes,
      command: value.command,
      args: Array.isArray(value.args) ? value.args : [],
      initializationOptions: value.initializationOptions || {},
      env: value.env,
      source: 'user'
    });
  }
  return out;
}

/**
 * Does registration match a grammar scope name?
 * @param {ServerRegistration} reg
 * @param {string} scopeName
 */
function matchesScope(reg, scopeName) {
  if (!scopeName || !reg.scopes) return false;
  for (const s of reg.scopes) {
    if (s === scopeName) return true;
    if (s.endsWith('.*') && scopeName.startsWith(s.slice(0, -2))) return true;
    if (scopeName === s || scopeName.startsWith(s + '.')) return true;
  }
  return false;
}

/**
 * Resolve the single best registration for a scope (precedence applied).
 * Package > user > builtin. Within a source, first match wins.
 * @param {string} scopeName
 * @param {{ resourcePath?: string }} [options]
 * @returns {ServerRegistration|null}
 */
function resolveRegistration(scopeName, options = {}) {
  if (!scopeName) return null;

  for (const reg of packageRegs.values()) {
    if (matchesScope(reg, scopeName)) return reg;
  }

  for (const reg of loadUserRegistrations()) {
    if (matchesScope(reg, scopeName)) return reg;
  }

  const builtins = resolveBuiltinRegistrations(options);
  for (const reg of builtins) {
    if (matchesScope(reg, scopeName)) return reg;
  }

  return null;
}

/**
 * List all known registrations (for status / debugging).
 */
function listRegistrations(options = {}) {
  const byId = new Map();
  // lowest precedence first so higher overwrites
  for (const reg of resolveBuiltinRegistrations(options)) {
    byId.set(reg.id, reg);
  }
  for (const reg of loadUserRegistrations()) {
    byId.set(reg.id, reg);
  }
  for (const reg of packageRegs.values()) {
    byId.set(reg.id, reg);
  }
  return [...byId.values()];
}

/**
 * Resolve command to an absolute path when possible (Windows PATHEXT).
 * @param {ServerRegistration} reg
 * @returns {ServerRegistration|null} null if binary not found on PATH
 */
function resolveCommand(reg) {
  if (!reg) return null;
  if (pathIsAbsolute(reg.command)) {
    return reg;
  }
  const resolved = which(reg.command);
  if (!resolved) return null;
  return Object.assign({}, reg, { command: resolved });
}

function pathIsAbsolute(p) {
  if (!p || typeof p !== 'string') return false;
  if (p.startsWith('/') || p.startsWith('\\')) return true;
  // Windows drive
  return /^[A-Za-z]:[\\/]/.test(p);
}

/**
 * Service object for `chevron.lsp` 1.0.0
 */
function createLspService() {
  return {
    registerServer,
    listRegistrations: () => listRegistrations({ resourcePath: null }),
    resolveRegistration: scope => resolveRegistration(scope)
  };
}

/** test helper */
function _clearPackageRegistrations() {
  packageRegs.clear();
}

module.exports = {
  registerServer,
  resolveRegistration,
  listRegistrations,
  resolveCommand,
  matchesScope,
  loadUserRegistrations,
  createLspService,
  normalizePackageSpec,
  _clearPackageRegistrations,
  _packageRegs: packageRegs
};
