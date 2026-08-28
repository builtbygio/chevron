'use strict';

/**
 * Main-process manager for the package host v2 utilityProcess (Epic 21).
 *
 * Slice 21.1: spawn / supervise / shut down the host. No package loading yet.
 *
 * Shape deliberately mirrors lsp-worker-manager.js so the two supervised hosts
 * behave the same way (boot handshake, request/response ids, exit broadcast).
 *
 * See docs/reference/security-phase-s-package-host.md.
 */

const path = require('path');
const { app, utilityProcess } = require('electron');

const HOST_SCRIPT = path.join(__dirname, 'workers', 'package-host.js');

const BOOT_TIMEOUT_MS = 10000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

let host = null;
let hostReady = false;
let bootPromise = null;
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
      wc.send('chevron:package-host-event', msg);
    } catch (_) {
      subscribers.delete(wc);
    }
  }
}

function rejectAllPending(error) {
  for (const [, p] of pending) p.reject(error);
  pending.clear();
}

function ensureHost() {
  if (host && hostReady) return Promise.resolve();
  if (bootPromise) return bootPromise;

  if (!utilityProcess || typeof utilityProcess.fork !== 'function') {
    return Promise.reject(new Error('utilityProcess.fork unavailable'));
  }

  bootPromise = new Promise((resolve, reject) => {
    let child;
    try {
      child = utilityProcess.fork(HOST_SCRIPT, [], {
        serviceName: 'chevron-package-host',
        env: Object.assign({}, process.env, {
          CHEVRON_APP_PATH: getAppPath()
        }),
        stdio: 'pipe'
      });
    } catch (err) {
      bootPromise = null;
      reject(err);
      return;
    }

    host = child;
    hostReady = false;

    const bootTimer = setTimeout(() => {
      bootPromise = null;
      try {
        child.kill();
      } catch (_) {
        /* ignore */
      }
      reject(new Error('Package host boot timeout'));
    }, BOOT_TIMEOUT_MS);

    child.on('message', raw => {
      const msg = raw && raw.data ? raw.data : raw;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'host-booted') {
        hostReady = true;
        clearTimeout(bootTimer);
        bootPromise = null;
        broadcast(msg);
        resolve();
        return;
      }

      // Reverse RPC: a host package calling an editor-side service (21.3).
      if (msg.type === 'host-request') {
        handleHostRequest(msg);
        return;
      }

      if (msg.type === 'response' && msg.requestId != null) {
        const p = pending.get(msg.requestId);
        if (!p) return;
        pending.delete(msg.requestId);
        if (msg.error) p.reject(new Error(msg.error.message || String(msg.error)));
        else p.resolve(msg);
        return;
      }

      broadcast(msg);
    });

    child.on('exit', code => {
      clearTimeout(bootTimer);
      host = null;
      hostReady = false;
      bootPromise = null;
      rejectAllPending(new Error(`Package host exited (${code})`));
      broadcast({ type: 'host-exit', code });
    });
  });

  return bootPromise;
}

function postToHost(msg) {
  if (!host) throw new Error('Package host not running');
  host.postMessage(msg);
}

function hostRequest(partial, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  return ensureHost().then(
    () =>
      new Promise((resolve, reject) => {
        const requestId = nextRequestId++;
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(`Package host request timeout (${partial.type})`));
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
  if (webContents && !webContents.isDestroyed()) subscribers.add(webContents);
}

function unsubscribe(webContents) {
  subscribers.delete(webContents);
}

function isRunning() {
  return Boolean(host && hostReady);
}

async function ping() {
  const msg = await hostRequest({ type: 'ping' }, 5000);
  return { ok: Boolean(msg.pong), at: msg.at };
}

async function describe() {
  const msg = await hostRequest({ type: 'describe' }, 5000);
  return msg.host;
}

// --- editor-side services offered to host packages (21.3) -----------------
/** "name@version" -> { name, version, methods, handler } */
const editorServices = new Map();

function serviceKey(name, version) {
  return `${name}@${version}`;
}

/**
 * Publish an editor-owned service to host packages.
 *
 * `handler(method, args)` performs the real call. The host receives only the
 * method-name list and turns calls back into RPC, so no live object crosses
 * the boundary.
 */
async function offerEditorService({ name, version, methods, handler }) {
  if (!name || !version) throw new Error('offerEditorService requires name and version');
  editorServices.set(serviceKey(name, version), {
    name,
    version,
    methods: methods || [],
    handler
  });
  if (!isRunning()) return { ok: true, deferred: true };
  const msg = await hostRequest(
    { type: 'offer-editor-service', name, version, methods: methods || [] },
    15000
  );
  return { ok: true, wired: msg.wired || [] };
}

function revokeEditorService(name, version) {
  return editorServices.delete(serviceKey(name, version));
}

function handleHostRequest(msg) {
  const reply = payload =>
    postToHost(Object.assign({ type: 'host-response', hostRequestId: msg.hostRequestId }, payload));

  if (msg.type !== 'host-request') return;

  if (msg.subtype === 'call-editor-service' || msg.method != null) {
    const entry = editorServices.get(serviceKey(msg.name, msg.version));
    if (!entry || typeof entry.handler !== 'function') {
      reply({ error: { message: `No such editor service: ${msg.name}@${msg.version}` } });
      return;
    }
    Promise.resolve()
      .then(() => entry.handler(msg.method, msg.args || []))
      .then(result => reply({ result }))
      .catch(err => reply({ error: { message: err && err.message ? err.message : String(err) } }));
    return;
  }

  reply({ error: { message: `Unhandled host request: ${msg.type}` } });
}

/** Services provided by packages running inside the host. */
async function listHostServices() {
  if (!isRunning()) return [];
  const msg = await hostRequest({ type: 'list-services' }, 5000);
  return msg.services || [];
}

/** Call a service a host package provides. */
async function callHostService(name, version, method, args) {
  const msg = await hostRequest(
    { type: 'call-service', name, version, method, args: args || [] },
    15000
  );
  return msg.result;
}

/**
 * Activate a package inside the host (slice 21.2).
 *
 * The caller supplies a **config snapshot** because packages read config
 * synchronously during `activate()` and the real config lives in the editor.
 * See docs/reference/security-phase-s-package-host.md "Activation flow (v2)".
 */
async function activatePackage({ name, root, configSnapshot, state }) {
  if (!root) throw new Error('activatePackage requires a package root');
  const msg = await hostRequest(
    {
      type: 'activate-package',
      name,
      root,
      configSnapshot: configSnapshot || {},
      state
    },
    30000
  );
  return {
    name: msg.name,
    activated: Boolean(msg.activated),
    alreadyActive: Boolean(msg.alreadyActive),
    commands: msg.commands || [],
    contributions: msg.contributions || []
  };
}

async function deactivatePackage(name) {
  if (!isRunning()) return { name, deactivated: false, reason: 'host-not-running' };
  const msg = await hostRequest({ type: 'deactivate-package', name }, 15000);
  return { name: msg.name, deactivated: Boolean(msg.deactivated), state: msg.state };
}

async function listPackages() {
  if (!isRunning()) return [];
  const msg = await hostRequest({ type: 'list-packages' }, 5000);
  return msg.packages || [];
}

async function dispatchCommand(name, command, detail) {
  const msg = await hostRequest({ type: 'dispatch-command', name, command, detail }, 15000);
  return { dispatched: Boolean(msg.dispatched) };
}

async function notifyConfigChanged(keyPath, value) {
  if (!isRunning()) return { ok: false };
  await hostRequest({ type: 'config-changed', keyPath, value }, 5000);
  return { ok: true };
}

async function shutdownHost() {
  if (!host) return { ok: true };
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
  bootPromise = null;
  rejectAllPending(new Error('Package host shut down'));
  return { ok: true };
}

module.exports = {
  ensureHost,
  isRunning,
  subscribe,
  unsubscribe,
  ping,
  describe,
  activatePackage,
  deactivatePackage,
  offerEditorService,
  revokeEditorService,
  listHostServices,
  callHostService,
  listPackages,
  dispatchCommand,
  notifyConfigChanged,
  shutdownHost,
  // exported for tests
  HOST_SCRIPT
};
