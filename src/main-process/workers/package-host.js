'use strict';

/**
 * utilityProcess entry: package host v2 (Epic 21, slice 21.1).
 * Pure Node — no DOM. This slice boots and answers control messages only;
 * it deliberately does **not** load or activate any package yet (21.2).
 *
 * See docs/security-phase-s-package-host.md "Host v2 (target)".
 *
 * inbound:  { type, requestId?, ... }
 * outbound: { type, requestId?, ... }
 */

const BOOTED_AT = Date.now();

function post(msg) {
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    process.parentPort.postMessage(msg);
  } else if (typeof process.send === 'function') {
    process.send(msg);
  }
}

function respond(requestId, payload) {
  if (requestId == null) return;
  post(Object.assign({ type: 'response', requestId }, payload));
}

function respondError(requestId, error) {
  if (requestId == null) return;
  post({
    type: 'response',
    requestId,
    error: { message: error && error.message ? error.message : String(error) }
  });
}

/**
 * The host runs T2 (community) package code. It must never hand that code the
 * privileged surface the editor preload has. 21.2 introduces the stub
 * `chevron` proxy; until then we only report what the sandbox looks like so the
 * manager can assert on it.
 */
function describeHost() {
  return {
    pid: process.pid,
    node: process.versions.node,
    electron: process.versions.electron || null,
    // A utilityProcess has no DOM. Asserting this keeps 21.4's hybrid routing
    // honest: anything needing `document` must stay editor-side.
    hasDocument: typeof document !== 'undefined',
    hasWindow: typeof window !== 'undefined',
    uptimeMs: Date.now() - BOOTED_AT,
    packagesLoaded: 0
  };
}

function onMessage(raw) {
  const msg = raw && raw.data ? raw.data : raw;
  if (!msg || typeof msg !== 'object') return;
  const { type, requestId } = msg;

  try {
    switch (type) {
      case 'ping':
        respond(requestId, { pong: true, at: Date.now() });
        return;

      case 'describe':
        respond(requestId, { host: describeHost() });
        return;

      case 'shutdown':
        post({ type: 'host-shutdown' });
        // Let the message flush before the manager kills us.
        setTimeout(() => process.exit(0), 0);
        return;

      default:
        respondError(requestId, new Error(`Unknown package-host message: ${type}`));
    }
  } catch (err) {
    respondError(requestId, err);
  }
}

if (process.parentPort && typeof process.parentPort.on === 'function') {
  process.parentPort.on('message', onMessage);
} else {
  process.on('message', onMessage);
}

post({ type: 'host-booted', pid: process.pid, bootedAt: BOOTED_AT });
