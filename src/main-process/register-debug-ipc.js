'use strict';

/**
 * One Node debug session per window. The renderer names a JavaScript file
 * and the breakpoints; main launches the bundled adapter and forwards DAP.
 */

const path = require('path');
const { validateProgram, validateBreakpoints } = require('./debug-policy');
const { DebugClient } = require('./debug-client');

const ADAPTER = path.join(__dirname, 'workers', 'node-debug-adapter.js');

function rootsFor(atomApplication, sender) {
  if (!atomApplication || !sender) return [];
  const window =
    typeof atomApplication.atomWindowForEvent === 'function'
      ? atomApplication.atomWindowForEvent({ sender })
      : null;
  const roots = window && window.projectRoots ? window.projectRoots : [];
  return Array.isArray(roots) ? roots : [];
}

function createDebugManager(deps = {}) {
  const forkImpl =
    deps.forkImpl ||
    ((script) => {
      const { utilityProcess } = require('electron');
      return utilityProcess.fork(script, [], {
        serviceName: 'chevron-node-debug',
        stdio: 'pipe'
      });
    });
  const sessions = new Map();

  function send(child, message) {
    if (typeof child.postMessage === 'function') child.postMessage(message);
    else child.send(message);
  }

  function stop(sender) {
    const session = sessions.get(sender.id);
    if (!session) return;
    sessions.delete(sender.id);
    try {
      session.client.request('disconnect').catch(() => {});
    } catch (_) {}
    try {
      if (typeof session.child.kill === 'function') session.child.kill();
    } catch (_) {}
  }

  async function start(sender, payload = {}) {
    const roots = deps.getRoots ? deps.getRoots(sender) : [];
    const program = validateProgram(payload.program, roots, deps.isFile);
    if (!program.ok) {
      const error = new Error(program.reason);
      error.code = 'DEBUG_REJECTED';
      throw error;
    }
    const breakpoints = validateBreakpoints(payload.breakpoints, roots, deps.isFile);
    if (!breakpoints.ok) {
      const error = new Error(breakpoints.reason);
      error.code = 'DEBUG_REJECTED';
      throw error;
    }
    stop(sender);
    const child = forkImpl(deps.adapter || ADAPTER);
    const client = new DebugClient(
      message => send(child, message),
      message => {
        if (sender.isDestroyed && sender.isDestroyed()) return;
        try {
          sender.send('chevron:debug-event', message);
        } catch (_) {}
      }
    );
    sessions.set(sender.id, { child, client });
    child.on('message', message => client.receive(message));
    child.on('exit', () => {
      const current = sessions.get(sender.id);
      if (current && current.child === child) sessions.delete(sender.id);
    });
    await client.launch(program.program, breakpoints.breakpoints);
    return { ok: true };
  }

  async function request(sender, payload = {}) {
    const command = payload.command;
    if (typeof command !== 'string' || !/^[a-zA-Z]+$/.test(command)) {
      const error = new Error('unknown debug command');
      error.code = 'DEBUG_REJECTED';
      throw error;
    }
    const session = sessions.get(sender.id);
    if (!session) {
      const error = new Error('no debug session');
      error.code = 'DEBUG_REJECTED';
      throw error;
    }
    return session.client.request(command, payload.arguments || {});
  }

  return { start, request, stop };
}

function registerDebugIpc(atomApplication, deps = {}) {
  const { ipcMain } = deps.ipcMain ? deps : require('electron');
  const manager = createDebugManager(
    Object.assign(
      {
        getRoots: sender => rootsFor(atomApplication, sender)
      },
      deps
    )
  );
  ipcMain.handle('chevron:debug-start', (event, payload) =>
    manager.start(event.sender, payload || {})
  );
  ipcMain.handle('chevron:debug-request', (event, payload) =>
    manager.request(event.sender, payload || {})
  );
  ipcMain.handle('chevron:debug-stop', event => {
    manager.stop(event.sender);
    return { ok: true };
  });
  return manager;
}

module.exports = registerDebugIpc;
module.exports.createDebugManager = createDebugManager;
