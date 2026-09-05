'use strict';

/**
 * Pseudoterminals, owned by a utilityProcess and reached over a validated IPC.
 *
 * A terminal is the widest hole a renderer can ask for: it spawns arbitrary
 * processes. So it is built the way ripgrep and the LSP host are — the
 * renderer asks, main decides, and the spawning happens somewhere the renderer
 * cannot reach. Every argument is checked here rather than trusted, and the
 * checks are the same shape as register-rg-ipc's, deliberately.
 *
 * docs/process/next-tracks-plan.md, track 3.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const guard = require('./ipc-guard');

const HOST_SCRIPT = path.join(__dirname, 'workers', 'pty-host.js');

/** A shell has to be an absolute path to something executable. */
function validateShell(shell, { isFile } = {}) {
  if (typeof shell !== 'string' || !shell || shell.includes('\0')) {
    return { ok: false, reason: 'shell must be a nul-free string' };
  }
  if (!path.isAbsolute(shell)) {
    return { ok: false, reason: 'shell must be an absolute path' };
  }
  const exists = isFile || (p => {
    try {
      return fs.statSync(p).isFile();
    } catch (_) {
      return false;
    }
  });
  if (!exists(shell)) {
    return { ok: false, reason: 'shell does not exist' };
  }
  return { ok: true };
}

function validateArgs(args) {
  return guard.requireStringArray(args, { name: 'args' });
}

/**
 * The working directory has to be a real directory, and one the window is
 * already working in: a project root, or the user's home. A terminal that can
 * start anywhere makes the FS IPC roots meaningless.
 */
function validateCwd(cwd, roots, { isDirectory } = {}) {
  return guard.requireDirectoryInRoots(cwd, roots, { name: 'cwd', isDirectory });
}

function validateSize(cols, rows) {
  for (const [name, value] of [['cols', cols], ['rows', rows]]) {
    const check = guard.requireInt(value, { name, min: 1, max: 5000 });
    if (!check.ok) return check;
  }
  return { ok: true };
}

/**
 * Only a fixed set of variables may be handed to the shell, and only as
 * strings. The renderer supplying arbitrary environment is how a terminal
 * turns into a way to reconfigure the process it spawns.
 */
const ENV_ALLOWLIST = new Set(['LANG', 'LC_ALL', 'COLORTERM']);

function sanitizeEnv(env) {
  return guard.sanitizeEnv(env, ENV_ALLOWLIST);
}

function createPtyManager(deps = {}) {
  const utilityProcess =
    deps.utilityProcess ||
    (deps.electron && deps.electron.utilityProcess) ||
    require('electron').utilityProcess;
  const getRoots = deps.getRoots || (() => []);
  const getAppPath = deps.getAppPath || (() => process.cwd());
  const hostScript = deps.hostScript || HOST_SCRIPT;

  let host = null;
  let nextId = 1;
  // Which webContents owns which session, so one window cannot write to
  // another's terminal and a closed window takes its shells with it.
  const owners = new Map();

  function ensureHost() {
    if (host) return host;
    host = utilityProcess.fork(hostScript, [], {
      serviceName: 'chevron-pty-host',
      env: Object.assign({}, process.env, { CHEVRON_APP_PATH: getAppPath() }),
      stdio: 'pipe'
    });

    host.on('message', message => {
      if (!message || typeof message !== 'object') return;
      const owner = owners.get(message.id);
      if (!owner) return;
      if (message.type === 'exit') owners.delete(message.id);
      if (owner.isDestroyed && owner.isDestroyed()) return;
      owner.send('chevron:pty-event', message);
    });

    host.on('exit', () => {
      for (const [id, owner] of owners) {
        if (owner.isDestroyed && owner.isDestroyed()) continue;
        owner.send('chevron:pty-event', {
          type: 'exit',
          id,
          exitCode: null,
          signal: 'host-exited'
        });
      }
      owners.clear();
      host = null;
    });

    return host;
  }

  function reject(reason) {
    const error = new Error(`chevron:pty-spawn: ${reason}`);
    error.code = 'PTY_REJECTED';
    throw error;
  }

  function spawn(payload = {}, sender) {
    const shell = payload.shell;
    const shellCheck = validateShell(shell, deps);
    if (!shellCheck.ok) reject(shellCheck.reason);

    const argsCheck = validateArgs(payload.args);
    if (!argsCheck.ok) reject(argsCheck.reason);

    const cwdCheck = validateCwd(payload.cwd, getRoots(sender), deps);
    if (!cwdCheck.ok) reject(cwdCheck.reason);

    const sizeCheck = validateSize(payload.cols, payload.rows);
    if (!sizeCheck.ok) reject(sizeCheck.reason);

    const id = `pty-${nextId++}`;
    owners.set(id, sender);
    ensureHost().postMessage({
      type: 'spawn',
      id,
      shell,
      args: payload.args || [],
      cwd: payload.cwd,
      cols: payload.cols,
      rows: payload.rows,
      env: sanitizeEnv(payload.env)
    });
    return { id };
  }

  /** A session may only be driven by the window that asked for it. */
  function ownedBy(id, sender) {
    const owner = owners.get(id);
    return owner != null && owner === sender;
  }

  function write(payload = {}, sender) {
    if (!ownedBy(payload.id, sender)) return false;
    if (typeof payload.data !== 'string') return false;
    ensureHost().postMessage({ type: 'write', id: payload.id, data: payload.data });
    return true;
  }

  function resize(payload = {}, sender) {
    if (!ownedBy(payload.id, sender)) return false;
    const sizeCheck = validateSize(payload.cols, payload.rows);
    if (!sizeCheck.ok) return false;
    ensureHost().postMessage({
      type: 'resize',
      id: payload.id,
      cols: payload.cols,
      rows: payload.rows
    });
    return true;
  }

  function kill(payload = {}, sender) {
    if (!ownedBy(payload.id, sender)) return false;
    owners.delete(payload.id);
    if (host) host.postMessage({ type: 'kill', id: payload.id });
    return true;
  }

  function killForSender(sender) {
    for (const [id, owner] of [...owners]) {
      if (owner !== sender) continue;
      owners.delete(id);
      if (host) host.postMessage({ type: 'kill', id });
    }
  }

  function shutdown() {
    if (!host) return;
    host.postMessage({ type: 'shutdown' });
    host = null;
    owners.clear();
  }

  return {
    spawn,
    write,
    resize,
    kill,
    killForSender,
    shutdown,
    validateShell,
    validateArgs,
    validateCwd,
    validateSize,
    sanitizeEnv,
    get sessionCount() {
      return owners.size;
    }
  };
}

function registerPtyIpc(atomApplication, deps = {}) {
  const { ipcMain } = deps.ipcMain ? deps : require('electron');
  const manager = createPtyManager(
    Object.assign(
      {
        getRoots(sender) {
          if (!atomApplication || !sender) return [];
          const window =
            typeof atomApplication.atomWindowForEvent === 'function'
              ? atomApplication.atomWindowForEvent({ sender })
              : null;
          const roots = window && window.projectRoots ? window.projectRoots : [];
          return Array.isArray(roots) ? roots : [];
        },
        getAppPath() {
          try {
            return require('electron').app.getAppPath();
          } catch (_) {
            return process.cwd();
          }
        }
      },
      deps
    )
  );

  ipcMain.handle('chevron:pty-spawn', (event, payload) =>
    manager.spawn(payload, event.sender)
  );
  ipcMain.handle('chevron:pty-write', (event, payload) =>
    manager.write(payload, event.sender)
  );
  ipcMain.handle('chevron:pty-resize', (event, payload) =>
    manager.resize(payload, event.sender)
  );
  ipcMain.handle('chevron:pty-kill', (event, payload) =>
    manager.kill(payload, event.sender)
  );

  return manager;
}

module.exports = registerPtyIpc;
module.exports.createPtyManager = createPtyManager;
module.exports.validateShell = validateShell;
module.exports.validateArgs = validateArgs;
module.exports.validateCwd = validateCwd;
module.exports.validateSize = validateSize;
module.exports.sanitizeEnv = sanitizeEnv;
