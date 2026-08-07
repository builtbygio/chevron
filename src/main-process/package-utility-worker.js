'use strict';

/**
 * Main-process manager for package utility workers (Phase S3 / #61).
 *
 * Dual-path for github git workers: utilityProcess instead of Node BrowserWindow.
 * Feature flag: CHEVRON_GITHUB_UTILITY_WORKERS=1 (or core.githubUtilityWorkers).
 *
 * See docs/security-phase-s-utilityprocess.md.
 */

const path = require('path');
const { app, utilityProcess } = require('electron');

const HOST_SCRIPT = path.join(__dirname, 'workers', 'git-utility-host.js');

// Synthetic BrowserWindow / webContents ids (negative to avoid clashing with real ones).
let nextSyntheticId = -1;
// workerId (synthetic window id) -> meta
const workers = new Map();

function envEnabled() {
  const v = process.env.CHEVRON_GITHUB_UTILITY_WORKERS;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function isEnabled() {
  return envEnabled();
}

function allocateIds() {
  const id = nextSyntheticId--;
  const webContentsId = nextSyntheticId--;
  return { id, webContentsId };
}

function parseWorkerLoadUrl(loadUrl) {
  if (typeof loadUrl !== 'string' || loadUrl.length === 0) return null;
  try {
    const url = new URL(loadUrl);
    if (url.protocol !== 'file:') return null;
    // file:///path/to/renderer.html?js=...&managerWebContentsId=...
    const params = url.searchParams;
    return {
      managerWebContentsId: parseInt(params.get('managerWebContentsId'), 10),
      operationCountLimit: parseInt(params.get('operationCountLimit'), 10) || 10,
      channelName: params.get('channelName') || 'github:renderer-ipc'
    };
  } catch (error) {
    // Older URL forms / missing WHATWG support edge cases
    const q = loadUrl.indexOf('?');
    if (q < 0) return null;
    const qs = new URLSearchParams(loadUrl.slice(q + 1));
    return {
      managerWebContentsId: parseInt(qs.get('managerWebContentsId'), 10),
      operationCountLimit: parseInt(qs.get('operationCountLimit'), 10) || 10,
      channelName: qs.get('channelName') || 'github:renderer-ipc'
    };
  }
}

function forwardToManager(meta, message) {
  if (!meta || !meta.managerWc) return;
  if (meta.managerWc.isDestroyed()) return;
  const channel = meta.channelName || 'github:renderer-ipc';
  const payload = {
    sourceWebContentsId: meta.webContentsId,
    type: message.type,
    data: message.data
  };
  try {
    meta.managerWc.send(channel, payload);
  } catch (error) {
    console.error('package-utility-worker: forward failed', error);
  }
}

function destroyWorker(workerId, reason) {
  const meta = workers.get(workerId);
  if (!meta) return true;
  workers.delete(workerId);
  try {
    if (meta.child && typeof meta.child.kill === 'function') {
      meta.child.kill();
    }
  } catch (error) {
    /* ignore */
  }
  if (meta.managerWc && !meta.managerWc.isDestroyed()) {
    try {
      meta.managerWc.send('atom-utility-worker-event', {
        windowId: workerId,
        webContentsId: meta.webContentsId,
        event: reason === 'crashed' ? 'crashed' : 'destroyed'
      });
      // Also mirror BrowserWindow worker events used by remote-compat
      meta.managerWc.send('atom-worker-window-event', {
        windowId: workerId,
        webContentsId: meta.webContentsId,
        event: reason === 'crashed' ? 'crashed' : 'destroyed'
      });
    } catch (error) {
      /* ignore */
    }
  }
  return true;
}

function createWorker(managerWc) {
  if (!isEnabled()) {
    return null;
  }
  if (!utilityProcess || typeof utilityProcess.fork !== 'function') {
    console.error(
      'package-utility-worker: utilityProcess.fork unavailable in this Electron'
    );
    return null;
  }

  const { id, webContentsId } = allocateIds();
  let child;
  try {
    child = utilityProcess.fork(HOST_SCRIPT, [], {
      serviceName: 'chevron-git-worker',
      env: Object.assign({}, process.env, {
        CHEVRON_APP_PATH: app.getAppPath()
      }),
      stdio: 'pipe'
    });
  } catch (error) {
    console.error('package-utility-worker: fork failed', error);
    return null;
  }

  const meta = {
    id,
    webContentsId,
    child,
    managerWc,
    managerWcId: managerWc.id,
    channelName: 'github:renderer-ipc',
    ready: false,
    loadUrl: null
  };
  workers.set(id, meta);

  const onMessage = message => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'host-booted') return;
    if (message.type === 'host-error') {
      console.error('package-utility-worker host-error', message.data);
      return;
    }
    if (message.type === 'renderer-ready') {
      meta.ready = true;
    }
    forwardToManager(meta, message);
  };

  child.on('message', onMessage);
  child.on('exit', code => {
    if (workers.has(id)) {
      destroyWorker(id, code === 0 ? 'destroyed' : 'crashed');
    }
  });

  // If manager dies, kill utility worker
  const destroyOnManagerGone = () => destroyWorker(id, 'destroyed');
  managerWc.once('destroyed', destroyOnManagerGone);
  managerWc.once('render-process-gone', destroyOnManagerGone);
  meta._detachManager = () => {
    try {
      managerWc.removeListener('destroyed', destroyOnManagerGone);
      managerWc.removeListener('render-process-gone', destroyOnManagerGone);
    } catch (error) {
      /* ignore */
    }
  };

  return { id, webContentsId };
}

function loadWorkerUrl(workerId, loadUrl) {
  const meta = workers.get(workerId);
  if (!meta) return false;
  const parsed = parseWorkerLoadUrl(loadUrl);
  if (!parsed || !Number.isFinite(parsed.managerWebContentsId)) {
    console.warn(
      'package-utility-worker: rejected loadURL (expected github worker file URL)',
      loadUrl
    );
    return false;
  }
  meta.channelName = parsed.channelName;
  meta.loadUrl = loadUrl;
  try {
    meta.child.postMessage({
      type: 'init',
      managerWebContentsId: parsed.managerWebContentsId,
      operationCountLimit: parsed.operationCountLimit,
      channelName: parsed.channelName,
      syntheticWebContentsId: meta.webContentsId
    });
    return true;
  } catch (error) {
    console.error('package-utility-worker: init postMessage failed', error);
    return false;
  }
}

function sendToWorker(workerId, channel, payload) {
  const meta = workers.get(workerId);
  if (!meta || !meta.child) return false;
  // github WorkerManager sends { type: 'git-exec'|'git-cancel', data }
  if (!payload || typeof payload !== 'object') return false;
  const type = payload.type;
  if (type !== 'git-exec' && type !== 'git-cancel') {
    console.warn(
      `package-utility-worker: blocked non-git message type ${String(type)}`
    );
    return false;
  }
  try {
    meta.child.postMessage({ type, data: payload.data });
    return true;
  } catch (error) {
    console.error('package-utility-worker: send failed', error);
    return false;
  }
}

function isUtilityWorker(workerId) {
  return workers.has(workerId);
}

function getWorker(workerId) {
  return workers.get(workerId) || null;
}

function destroy(workerId) {
  return destroyWorker(workerId, 'destroyed');
}

module.exports = {
  isEnabled,
  envEnabled,
  createWorker,
  loadWorkerUrl,
  sendToWorker,
  isUtilityWorker,
  getWorker,
  destroy,
  parseWorkerLoadUrl,
  // test helpers
  _workers: workers,
  _resetForTests() {
    for (const id of [...workers.keys()]) {
      destroyWorker(id, 'destroyed');
    }
    nextSyntheticId = -1;
  }
};
