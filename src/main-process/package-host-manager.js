'use strict';

/**
 * Main-process manager for the package host v2 utilityProcess (Epic 21).
 *
 * Slice 21.1: spawn / supervise / shut down the host. No package loading yet.
 *
 * Shape deliberately mirrors lsp-worker-manager.js so the two supervised hosts
 * behave the same way (boot handshake, request/response ids, exit broadcast).
 *
 * See docs/security-phase-s-package-host.md.
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
  shutdownHost,
  // exported for tests
  HOST_SCRIPT
};
