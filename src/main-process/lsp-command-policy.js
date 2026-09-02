'use strict';

/**
 * Which commands main is willing to spawn as a language server
 * (docs/reference/lsp-design.md §6.2).
 *
 * Main decides, from sources it can read itself: the built-in server table,
 * the user's own lsp.servers config, and commands a package registered and
 * main recorded at activation. The third is renderer-supplied and gated by the
 * workspace-trust prompt; what this removes is the silent path, where an
 * unregistered binary could be spawned at all.
 */

const path = require('path');
const fs = require('fs');
const { resolveUserDataFile } = require('../user-config-path');

/** registrationId -> command, as declared by the renderer at activation */
const registered = new Map();

/** Commands seen in the built-in table; resolved lazily and cached. */
let builtinCommands = null;

function normalize(command) {
  if (!command || typeof command !== 'string') return null;
  return process.platform === 'win32' ? command.toLowerCase() : command;
}

/** Basename without a Windows extension, for comparing `foo` to `foo.cmd`. */
function commandKey(command) {
  const n = normalize(command);
  if (!n) return null;
  const base = path.basename(n);
  return base.replace(/\.(cmd|exe|bat|ps1)$/i, '');
}

function loadBuiltinCommands() {
  // Re-scan: a cpm-installed chevron-lsp-* binary may appear after launch.
  builtinCommands = new Set();
  try {
    // Pure Node module; safe to require from the main process.
    const builtins = require('../lsp/builtin-servers');
    const regs =
      (builtins.resolveBuiltinRegistrations &&
        builtins.resolveBuiltinRegistrations({})) ||
      [];
    for (const reg of regs) {
      const key = commandKey(reg && reg.command);
      if (key) builtinCommands.add(key);
    }
  } catch (_) {
    /* table unavailable → only user config and registrations apply */
  }
  return builtinCommands;
}

/**
 * Record a server a package registered. Called from the renderer at
 * activation via `lsp:register-server`.
 * @param {{ id: string, command: string }} reg
 */
function recordRegistration(reg) {
  if (!reg || !reg.id || !reg.command) return false;
  registered.set(String(reg.id), String(reg.command));
  return true;
}

function forgetRegistration(id) {
  return registered.delete(String(id));
}

/**
 * Read the user's config from disk. Deliberately **not** taken from the
 * renderer: a value the renderer supplies is a value an attacker supplies.
 * @returns {object|null}
 */
function readUserConfig() {
  const home =
    process.env.CHEVRON_HOME ||
    process.env.ATOM_HOME ||
    path.join(require('os').homedir(), '.chevron');
  const { filePath } = resolveUserDataFile(home, 'config');
  try {
    if (!fs.existsSync(filePath)) return null;
    if (filePath.endsWith('.json')) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return require('season').readFileSync(filePath);
  } catch (_) {
    /* unreadable/malformed config → treat as no user servers */
  }
  return null;
}

/**
 * Commands from the user's own config (`lsp.servers`), read in main.
 * @param {object} userConfig parsed config object, or null
 * @returns {Set<string>}
 */
function userConfigCommands(userConfig) {
  const out = new Set();
  const servers =
    userConfig && userConfig['*'] && userConfig['*'].lsp
      ? userConfig['*'].lsp.servers
      : userConfig && userConfig.lsp
        ? userConfig.lsp.servers
        : null;
  if (!servers || typeof servers !== 'object') return out;
  for (const value of Object.values(servers)) {
    const key = commandKey(value && value.command);
    if (key) out.add(key);
  }
  return out;
}

/**
 * May this command be spawned?
 * @param {string} command
 * @param {{ userConfig?: object }} [context]
 * @returns {{ allowed: boolean, source?: string, reason?: string }}
 */
function checkCommand(command, context = {}) {
  // Config is read from disk here, never accepted from the caller.
  const userConfig =
    context.userConfig !== undefined ? context.userConfig : readUserConfig();
  const key = commandKey(command);
  if (!key) return { allowed: false, reason: 'empty or non-string command' };

  for (const [id, cmd] of registered) {
    if (commandKey(cmd) === key) return { allowed: true, source: `package:${id}` };
  }
  if (loadBuiltinCommands().has(key)) return { allowed: true, source: 'builtin' };
  if (userConfigCommands(userConfig).has(key)) {
    return { allowed: true, source: 'user-config' };
  }

  return {
    allowed: false,
    reason:
      `command "${command}" is not a known language server. It must come from ` +
      'the built-in table, your lsp.servers config, or a package registration.'
  };
}

module.exports = {
  checkCommand,
  readUserConfig,
  recordRegistration,
  forgetRegistration,
  // exported for tests
  _commandKey: commandKey,
  _reset() {
    registered.clear();
    builtinCommands = null;
  }
};
