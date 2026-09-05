'use strict';

/**
 * Shared payload checks for IPC handlers.
 *
 * Extracted from the handlers that already did this well — pty, rg and fs —
 * so the rest stop re-implementing it. Every check returns `{ ok, reason }`
 * so a handler can refuse with something to log.
 *
 * docs/process/ipc-surface-hardening.md
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function ok() {
  return { ok: true };
}

function no(reason) {
  return { ok: false, reason };
}

/** A nul-free string. A NUL truncates the value somewhere below this. */
function requireString(value, { name = 'value', allowEmpty = false } = {}) {
  if (typeof value !== 'string') return no(`${name} must be a string`);
  if (!allowEmpty && value.length === 0) return no(`${name} must not be empty`);
  if (value.includes('\0')) return no(`${name} must be nul-free`);
  return ok();
}

function requireInt(value, { name = 'value', min, max } = {}) {
  if (!Number.isInteger(value)) return no(`${name} must be an integer`);
  if (min !== undefined && value < min) return no(`${name} must be at least ${min}`);
  if (max !== undefined && value > max) return no(`${name} must be at most ${max}`);
  return ok();
}

/** An array of nul-free strings. Absent is allowed; present and wrong is not. */
function requireStringArray(value, { name = 'args', optional = true } = {}) {
  if (value == null) return optional ? ok() : no(`${name} is required`);
  if (!Array.isArray(value)) return no(`${name} must be an array`);
  for (const item of value) {
    const check = requireString(item, { name: `${name} entries`, allowEmpty: true });
    if (!check.ok) return check;
  }
  return ok();
}

/** Absolute, nul-free, and — when roots are given — inside one of them. */
function requireAbsolutePath(value, { name = 'path', roots } = {}) {
  const check = requireString(value, { name });
  if (!check.ok) return check;
  if (!path.isAbsolute(value)) return no(`${name} must be absolute`);
  if (roots === undefined) return ok();

  const resolved = path.resolve(value);
  const allowed = (roots || []).filter(Boolean);
  const inside = allowed.some(root => {
    const base = path.resolve(root);
    return resolved === base || resolved.startsWith(base + path.sep);
  });
  return inside ? ok() : no(`${name} is outside every allowed root`);
}

/**
 * A directory the window is already working in: a project root, or the
 * user's home. Somewhere that can start anywhere makes the roots meaningless.
 */
function requireDirectoryInRoots(value, roots, { name = 'cwd', isDirectory } = {}) {
  const check = requireAbsolutePath(value, {
    name,
    roots: [...(roots || []), os.homedir()]
  });
  if (!check.ok) {
    return check.reason.endsWith('outside every allowed root')
      ? no(`${name} is outside every project root`)
      : check;
  }
  const isDir =
    isDirectory ||
    (p => {
      try {
        return fs.statSync(p).isDirectory();
      } catch (_) {
        return false;
      }
    });
  return isDir(value) ? ok() : no(`${name} is not a directory`);
}

/** The sender's own window, or a refusal. */
function requireOwnerWindow(event, { BrowserWindow } = {}) {
  const windows = BrowserWindow || require('electron').BrowserWindow;
  const sender = event && event.sender;
  if (!sender) return no('no sender');
  const win = windows.fromWebContents(sender);
  if (!win) return no('sender has no window');
  return { ok: true, window: win };
}

/**
 * A resource the sender created. `meta.managerWcId` is the pattern the
 * utility-worker channels already use.
 */
function requireOwner(event, meta, { idField = 'managerWcId' } = {}) {
  const sender = event && event.sender;
  if (!sender) return no('no sender');
  if (!meta) return no('no such resource');
  // Both ids must exist. Comparing two undefineds makes an unowned resource
  // match a sender that has no id, which is how everything becomes everyone's.
  const owner = meta[idField];
  if (owner === undefined || owner === null) return no('resource has no owner');
  if (sender.id === undefined || sender.id === null) return no('sender has no id');
  return owner === sender.id ? ok() : no('resource belongs to another window');
}

/**
 * Only a fixed set of variables reaches a spawned process, and only as
 * strings. Arbitrary environment is how spawning turns into reconfiguring
 * what gets spawned.
 */
function sanitizeEnv(env, allowlist) {
  const out = {};
  const allowed = allowlist instanceof Set ? allowlist : new Set(allowlist || []);
  if (!env || typeof env !== 'object') return out;
  for (const key of Object.keys(env)) {
    if (!allowed.has(key)) continue;
    const value = env[key];
    if (typeof value === 'string' && !value.includes('\0')) out[key] = value;
  }
  return out;
}

/** Absolute and nul-free, with no opinion about roots. */
function isSafeAbsolutePath(fullPath) {
  return requireAbsolutePath(fullPath, { roots: undefined }).ok;
}

module.exports = {
  requireString,
  requireInt,
  requireStringArray,
  requireAbsolutePath,
  requireDirectoryInRoots,
  requireOwnerWindow,
  requireOwner,
  sanitizeEnv,
  isSafeAbsolutePath
};
