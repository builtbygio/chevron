'use strict';

/**
 * utilityProcess entry that owns pseudoterminals.
 *
 * A terminal spawns arbitrary processes, which is exactly what the FS IPC
 * roots, the privileged-require restriction and the trust prompt exist to
 * contain. If the renderer spawned shells, that model would be decorative --
 * so the renderer holds a view and a data channel, and this process does the
 * spawning. Same shape as the LSP host and the git workers.
 *
 * docs/process/next-tracks-plan.md, track 3.
 *
 *   inbound:  { type: 'spawn'|'write'|'resize'|'kill'|'shutdown', id, ... }
 *   outbound: { type: 'host-booted'|'spawned'|'data'|'exit'|'error', id, ... }
 */

const path = require('path');

const sessions = new Map();

function appPath() {
  return process.env.CHEVRON_APP_PATH || process.cwd();
}

let ptyModule = null;
function loadPty() {
  if (ptyModule) return ptyModule;
  // Resolved from the app path rather than relative to this file: packaged,
  // this script runs out of the asar while the native lives unpacked.
  ptyModule = require(require.resolve('node-pty', { paths: [appPath()] }));
  return ptyModule;
}

// Two transports on purpose: utilityProcess in the app, node:child_process
// fork in tests, so the protocol can be driven without Electron.
function send(message) {
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    process.parentPort.postMessage(message);
  } else if (typeof process.send === 'function') {
    process.send(message);
  }
}

function fail(id, error) {
  send({
    type: 'error',
    id,
    message: (error && error.message) || String(error)
  });
}

function spawn(msg) {
  const { id, shell, args, cwd, cols, rows, env } = msg;
  if (sessions.has(id)) return fail(id, new Error(`session ${id} exists`));

  let pty;
  try {
    pty = loadPty();
  } catch (error) {
    return fail(id, new Error(`node-pty unavailable: ${error.message}`));
  }

  let session;
  try {
    session = pty.spawn(shell, args || [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || undefined,
      env: Object.assign({}, process.env, env || {}, {
        TERM: 'xterm-256color',
        // Marks the shell as running inside Chevron, the way VS Code and
        // friends do, so a prompt can tell.
        TERM_PROGRAM: 'Chevron'
      })
    });
  } catch (error) {
    return fail(id, error);
  }

  sessions.set(id, session);
  send({ type: 'spawned', id, pid: session.pid });

  session.onData(data => send({ type: 'data', id, data }));
  session.onExit(({ exitCode, signal }) => {
    sessions.delete(id);
    send({ type: 'exit', id, exitCode, signal: signal == null ? null : signal });
  });
}

function write(msg) {
  const session = sessions.get(msg.id);
  if (session) session.write(msg.data);
}

function resize(msg) {
  const session = sessions.get(msg.id);
  if (!session) return;
  try {
    session.resize(Math.max(1, msg.cols | 0), Math.max(1, msg.rows | 0));
  } catch (error) {
    // A resize racing an exit is normal and not worth reporting.
  }
}

function kill(msg) {
  const session = sessions.get(msg.id);
  if (!session) return;
  try {
    session.kill();
  } catch (error) {
    // Already gone.
  }
  sessions.delete(msg.id);
}

function killAll() {
  for (const id of [...sessions.keys()]) kill({ id });
}

function onMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'spawn':
      return spawn(msg);
    case 'write':
      return write(msg);
    case 'resize':
      return resize(msg);
    case 'kill':
      return kill(msg);
    case 'shutdown':
      killAll();
      return process.exit(0);
    default:
      return;
  }
}

if (process.parentPort && typeof process.parentPort.on === 'function') {
  // utilityProcess delivers a MessageEvent, not the message. Reading the
  // fields straight off the event is how the LSP host looked alive and read
  // nothing at all (#309).
  process.parentPort.on('message', event => {
    onMessage(event && event.data !== undefined ? event.data : event);
  });
} else {
  process.on('message', onMessage);
}

process.on('exit', killAll);

send({ type: 'host-booted', pid: process.pid, appPath: path.basename(appPath()) });
