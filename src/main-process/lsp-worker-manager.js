'use strict';

/**
 * Main-process manager for the LSP utilityProcess host (Phase 1).
 * Enforces workspace trust before any start-server.
 * See docs/lsp-design.md.
 */

const path = require('path');
const { app, utilityProcess, BrowserWindow } = require('electron');
const lspTrust = require('./lsp-trust');
const commandPolicy = require('./lsp-command-policy');

const HOST_SCRIPT = path.join(__dirname, 'workers', 'lsp-host.js');

let host = null;
let hostReady = false;
let nextRequestId = 1;
const pending = new Map();
/** @type {Set<Electron.WebContents>} */
const subscribers = new Set();

function getAppPath() {
  try {
    return app.getAppPath();
  } catch (_) {
    return process.cwd();
  }
}

function broadcast(msg) {
  for (const wc of [...subscribers]) {
    if (wc.isDestroyed()) {
      subscribers.delete(wc);
      continue;
    }
    try {
      wc.send('lsp:event', msg);
    } catch (_) {
      subscribers.delete(wc);
    }
  }
}

function ensureHost() {
  if (host && hostReady) return Promise.resolve();
  if (host && !hostReady) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('LSP host start timeout')), 10000);
      const onReady = msg => {
        if (msg && msg.type === 'host-booted') {
          clearTimeout(t);
          hostReady = true;
          resolve();
        }
      };
      host._waitReady = onReady;
    });
  }

  if (!utilityProcess || typeof utilityProcess.fork !== 'function') {
    return Promise.reject(new Error('utilityProcess.fork unavailable'));
  }

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = utilityProcess.fork(HOST_SCRIPT, [], {
        serviceName: 'chevron-lsp-host',
        env: Object.assign({}, process.env, {
          CHEVRON_APP_PATH: getAppPath()
        }),
        stdio: 'pipe'
      });
    } catch (err) {
      reject(err);
      return;
    }

    host = child;
    hostReady = false;

    const bootTimer = setTimeout(() => {
      reject(new Error('LSP host boot timeout'));
    }, 10000);

    child.on('message', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'host-booted') {
        hostReady = true;
        clearTimeout(bootTimer);
        resolve();
        return;
      }
      if (msg.type === 'response' && msg.requestId != null) {
        const p = pending.get(msg.requestId);
        if (p) {
          pending.delete(msg.requestId);
          if (msg.error) p.reject(new Error(msg.error.message || String(msg.error)));
          else p.resolve(msg);
        }
        return;
      }
      if (msg.type === 'server-list' && msg.requestId != null) {
        const p = pending.get(msg.requestId);
        if (p) {
          pending.delete(msg.requestId);
          p.resolve(msg);
        }
        return;
      }
      // notifications, server-ready, server-exit, logs
      broadcast(msg);
    });

    child.on('exit', code => {
      host = null;
      hostReady = false;
      for (const [, p] of pending) {
        p.reject(new Error(`LSP host exited (${code})`));
      }
      pending.clear();
      broadcast({ type: 'host-exit', code });
    });
  });
}

function postToHost(msg) {
  if (!host) throw new Error('LSP host not running');
  host.postMessage(msg);
}

function hostRequest(partial, timeoutMs = 60000) {
  const requestId = nextRequestId++;
  return ensureHost().then(
    () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error('LSP host request timeout'));
        }, timeoutMs);
        pending.set(requestId, {
          resolve: v => {
            clearTimeout(timer);
            resolve(v);
          },
          reject: e => {
            clearTimeout(timer);
            reject(e);
          }
        });
        postToHost(Object.assign({ requestId }, partial));
      })
  );
}

function subscribe(webContents) {
  if (webContents && !webContents.isDestroyed()) {
    subscribers.add(webContents);
  }
}

function unsubscribe(webContents) {
  subscribers.delete(webContents);
}

async function startServer(opts) {
  const projectRoot = opts.projectRoot;
  if (!projectRoot || !lspTrust.isTrusted(projectRoot)) {
    const err = new Error(
      'Workspace is not trusted; language servers will not start. Use chevron-lsp:trust-project.'
    );
    err.code = 'LSP_UNTRUSTED';
    throw err;
  }

  // Main decides what may be spawned; the renderer no longer supplies an
  // arbitrary binary path (docs/lsp-design.md §6.2 — see lsp-command-policy).
  const check = commandPolicy.checkCommand(opts.command);
  if (!check.allowed) {
    const err = new Error(`Refusing to start language server: ${check.reason}`);
    err.code = 'LSP_COMMAND_NOT_ALLOWED';
    throw err;
  }

  await ensureHost();
  postToHost({
    type: 'start-server',
    serverId: opts.serverId,
    command: opts.command,
    args: opts.args || [],
    rootUri: opts.rootUri,
    cwd: opts.cwd || projectRoot,
    env: opts.env,
    initializationOptions: opts.initializationOptions
  });
  return { ok: true, serverId: opts.serverId };
}

async function request(serverId, method, params, timeoutMs) {
  const msg = await hostRequest(
    { type: 'request', serverId, method, params, timeoutMs },
    timeoutMs || 60000
  );
  return { result: msg.result, error: msg.error };
}

async function notify(serverId, method, params) {
  await ensureHost();
  postToHost({ type: 'notify', serverId, method, params });
  return { ok: true };
}

async function respondToServer(serverId, id, result, error) {
  await ensureHost();
  postToHost({ type: 'server-response', serverId, id, result, error });
  return { ok: true };
}

async function stopServer(serverId) {
  if (!host) return { ok: true };
  postToHost({ type: 'stop-server', serverId });
  return { ok: true };
}

async function listServers() {
  if (!host) return [];
  const msg = await hostRequest({ type: 'list-servers' }, 5000);
  return msg.servers || [];
}

async function shutdownHost() {
  if (!host) return;
  try {
    postToHost({ type: 'shutdown' });
  } catch (_) {
    /* ignore */
  }
  try {
    host.kill();
  } catch (_) {
    /* ignore */
  }
  host = null;
  hostReady = false;
}

function isTrusted(projectRoot) {
  return lspTrust.isTrusted(projectRoot);
}

function setTrusted(projectRoot, trusted) {
  return lspTrust.setTrusted(projectRoot, trusted);
}

function listTrusted() {
  return lspTrust.listTrusted();
}

function getTrustState(projectRoot) {
  return lspTrust.getTrustState(projectRoot);
}

module.exports = {
  ensureHost,
  subscribe,
  unsubscribe,
  startServer,
  recordRegistration: commandPolicy.recordRegistration,
  forgetRegistration: commandPolicy.forgetRegistration,
  request,
  notify,
  respondToServer,
  stopServer,
  listServers,
  shutdownHost,
  isTrusted,
  getTrustState,
  confirmAndGrantTrust: (root, win) => lspTrust.confirmAndGrantTrust(root, win),
  setTrusted,
  listTrusted
};
