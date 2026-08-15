'use strict';

/**
 * Allowlisted ripgrep spawn in main (architecture H1 PR 2b).
 * The renderer streams JSON lines and cancel() kills this child.
 * shell: false always. No utilityProcess host. No sandbox flip.
 */

const { spawn: defaultSpawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveRgPath } = require('../ripgrep-directory-searcher');

const FLAGS_BARE = new Set([
  '--json',
  '--ignore-case',
  '--multiline',
  '--hidden',
  '--follow',
  '--no-ignore-vcs',
  '--pcre2'
]);

const FLAGS_VALUE = new Set([
  '--regexp',
  '--before-context',
  '--after-context',
  '--glob'
]);

function validateArgs(args) {
  if (!Array.isArray(args) || args.length < 2) {
    return { ok: false, reason: 'args must be a non-empty array' };
  }
  for (const a of args) {
    if (typeof a !== 'string' || a.includes('\0')) {
      return { ok: false, reason: 'args must be nul-free strings' };
    }
  }
  if (args[args.length - 1] !== '.') {
    return { ok: false, reason: 'search path must be "."' };
  }
  if (!args.includes('--json') || !args.includes('--regexp')) {
    return { ok: false, reason: 'require --json and --regexp' };
  }

  for (let i = 0; i < args.length - 1; ) {
    const flag = args[i];
    if (FLAGS_BARE.has(flag)) {
      i += 1;
      continue;
    }
    if (FLAGS_VALUE.has(flag)) {
      const value = args[i + 1];
      if (value == null || value.startsWith('--') && flag !== '--regexp' && flag !== '--glob') {
        return { ok: false, reason: `missing value for ${flag}` };
      }
      if (flag === '--before-context' || flag === '--after-context') {
        if (!/^\d{1,4}$/.test(value)) {
          return { ok: false, reason: `${flag} must be a small integer` };
        }
      }
      if (flag === '--regexp' && value.length > 100000) {
        return { ok: false, reason: 'regexp too long' };
      }
      if (flag === '--glob' && value.length > 4096) {
        return { ok: false, reason: 'glob too long' };
      }
      i += 2;
      continue;
    }
    return { ok: false, reason: `flag not allowed: ${flag}` };
  }
  return { ok: true };
}

function validateCwd(cwd, isDirectory) {
  if (typeof cwd !== 'string' || !cwd || cwd.includes('\0')) return false;
  if (!path.isAbsolute(cwd)) return false;
  const resolved = path.resolve(cwd);
  if (resolved !== cwd && path.resolve(cwd + path.sep) !== resolved + path.sep) {
    /* still ok if only trailing slash differs */
  }
  try {
    if (typeof isDirectory === 'function') return isDirectory(resolved);
    return fs.statSync(resolved).isDirectory();
  } catch (_) {
    return false;
  }
}

function createRgSearchManager(opts = {}) {
  const spawnFn = opts.spawn || defaultSpawn;
  const resolvePath = opts.resolveRgPath || resolveRgPath;
  const existsSync = opts.existsSync || (p => fs.existsSync(p));
  const isDirectory =
    opts.isDirectory ||
    (p => {
      try {
        return fs.statSync(p).isDirectory();
      } catch (_) {
        return false;
      }
    });

  let nextId = 1;
  const searches = new Map();

  function start({ args, cwd, sender }) {
    const check = validateArgs(args);
    if (!check.ok) {
      const err = new Error(`chevron:rg-search-start: ${check.reason}`);
      err.code = 'RG_ARGS_REJECTED';
      throw err;
    }
    if (!validateCwd(cwd, isDirectory)) {
      const err = new Error('chevron:rg-search-start: invalid cwd');
      err.code = 'RG_CWD_REJECTED';
      throw err;
    }
    const rgPath = resolvePath();
    if (!rgPath || !existsSync(rgPath)) {
      const err = new Error('ripgrep binary not found');
      err.code = 'RG_MISSING';
      throw err;
    }

    const searchId = nextId++;
    const child = spawnFn(rgPath, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    });

    let stderr = '';
    const rec = { child, sender, stderr: () => stderr };
    searches.set(searchId, rec);

    if (child.stderr && child.stderr.on) {
      child.stderr.on('data', chunk => {
        stderr += String(chunk);
        if (stderr.length > 64 * 1024) {
          stderr = stderr.slice(-64 * 1024);
        }
      });
    }
    if (child.stdout && child.stdout.on) {
      child.stdout.on('data', chunk => {
        if (!sender || sender.isDestroyed && sender.isDestroyed()) return;
        try {
          sender.send('chevron:rg-search-data', {
            searchId,
            chunk: Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
          });
        } catch (_) {
          /* sender gone */
        }
      });
    }

    const finish = (code, signal) => {
      searches.delete(searchId);
      if (!sender || sender.isDestroyed && sender.isDestroyed()) return;
      try {
        sender.send('chevron:rg-search-close', {
          searchId,
          code,
          signal,
          stderr
        });
      } catch (_) {
        /* sender gone */
      }
    };
    child.on('close', finish);
    child.on('error', err => {
      stderr += err && err.message ? err.message : String(err);
      finish(1, null);
    });

    return { searchId };
  }

  function cancel(searchId, sender) {
    const rec = searches.get(searchId);
    if (!rec) return { ok: false };
    if (sender && rec.sender && rec.sender !== sender) return { ok: false };
    try {
      rec.child.kill();
    } catch (_) {
      /* already gone */
    }
    return { ok: true };
  }

  return { start, cancel, searches, validateArgs, validateCwd };
}

function registerRgIpc(_atomApplication, deps = {}) {
  const { ipcMain } = deps.ipcMain ? deps : require('electron');
  const manager = createRgSearchManager(deps);

  ipcMain.handle('chevron:rg-search-start', async (event, payload = {}) => {
    return manager.start({
      args: payload.args,
      cwd: payload.cwd,
      sender: event.sender
    });
  });

  ipcMain.handle('chevron:rg-search-cancel', async (event, payload = {}) => {
    return manager.cancel(payload.searchId, event.sender);
  });

  return manager;
}

module.exports = registerRgIpc;
module.exports.createRgSearchManager = createRgSearchManager;
module.exports.validateArgs = validateArgs;
module.exports.validateCwd = validateCwd;
