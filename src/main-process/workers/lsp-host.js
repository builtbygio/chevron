'use strict';

/**
 * utilityProcess entry: LSP host (Phase 1).
 * Spawns language servers as children; frames JSON-RPC over stdio.
 * Pure Node — no DOM.
 *
 * inbound:  { type, serverId?, ... }
 * outbound: { type, serverId?, ... }
 */

const { spawn } = require('child_process');
const path = require('path');
const {
  encodeMessage,
  LspFrameDecoder,
  parseBody
} = require('../../lsp/framing');

/** @type {Map<string, ServerSession>} */
const servers = new Map();

function post(msg) {
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    process.parentPort.postMessage(msg);
  } else if (typeof process.send === 'function') {
    process.send(msg);
  }
}

class ServerSession {
  constructor(id, config) {
    this.id = id;
    this.config = config;
    this.child = null;
    this.decoder = new LspFrameDecoder();
    this.pending = new Map();
    this.nextId = 1;
    this.state = 'starting';
    this.restarts = 0;
    this.lastStderr = '';
    this.initialized = false;
  }

  start() {
    const { command, args = [], env, cwd } = this.config;
    try {
      this.child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        cwd: cwd || process.cwd(),
        env: Object.assign({}, process.env, env || {})
      });
    } catch (err) {
      this.state = 'error';
      post({
        type: 'server-exit',
        serverId: this.id,
        code: -1,
        error: err.message
      });
      return;
    }

    this.state = 'running';
    this.child.stdout.on('data', chunk => this._onStdout(chunk));
    this.child.stderr.on('data', chunk => {
      this.lastStderr = (this.lastStderr + chunk.toString('utf8')).slice(-8000);
      post({
        type: 'log',
        serverId: this.id,
        level: 'stderr',
        text: chunk.toString('utf8')
      });
    });
    this.child.on('error', err => {
      this.state = 'error';
      post({
        type: 'server-exit',
        serverId: this.id,
        code: -1,
        error: err.message,
        stderr: this.lastStderr
      });
    });
    this.child.on('exit', (code, signal) => {
      this.state = 'exited';
      for (const [, p] of this.pending) {
        p.reject(new Error(`server exited code=${code} signal=${signal}`));
      }
      this.pending.clear();
      post({
        type: 'server-exit',
        serverId: this.id,
        code,
        signal,
        stderr: this.lastStderr
      });
    });

    post({
      type: 'server-ready',
      serverId: this.id,
      pid: this.child.pid,
      state: this.state
    });
  }

  _onStdout(chunk) {
    let bodies;
    try {
      bodies = this.decoder.push(chunk);
    } catch (err) {
      post({
        type: 'log',
        serverId: this.id,
        level: 'error',
        text: `framing: ${err.message}`
      });
      return;
    }
    for (const body of bodies) {
      let msg;
      try {
        msg = parseBody(body);
      } catch (err) {
        post({
          type: 'log',
          serverId: this.id,
          level: 'error',
          text: `json: ${err.message}`
        });
        continue;
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        p.resolve(msg);
      } else if (msg.method) {
        post({
          type: 'notification',
          serverId: this.id,
          method: msg.method,
          params: msg.params
        });
      }
    }
  }

  request(method, params, timeoutMs = 30000) {
    if (!this.child || !this.child.stdin.writable) {
      return Promise.reject(new Error('server not running'));
    }
    const id = this.nextId++;
    const msg = { jsonrpc: '2.0', id, method, params };
    this.child.stdin.write(encodeMessage(msg));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: m => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: e => {
          clearTimeout(timer);
          reject(e);
        }
      });
    });
  }

  notify(method, params) {
    if (!this.child || !this.child.stdin.writable) return;
    this.child.stdin.write(
      encodeMessage({ jsonrpc: '2.0', method, params })
    );
  }

  async initialize() {
    const { rootUri, initializationOptions, clientName } = this.config;
    const result = await this.request('initialize', {
      processId: process.pid,
      clientInfo: { name: clientName || 'chevron-lsp', version: '0.1.0' },
      rootUri: rootUri || null,
      capabilities: {
        general: {
          positionEncodings: ['utf-16', 'utf-8']
        },
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: true },
          publishDiagnostics: { relatedInformation: true },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: true },
          completion: {
            completionItem: { snippetSupport: true, documentationFormat: ['markdown', 'plaintext'] }
          }
        },
        workspace: {
          workspaceFolders: true
        }
      },
      initializationOptions: initializationOptions || {},
      workspaceFolders: rootUri
        ? [{ uri: rootUri, name: path.basename(rootUri.replace(/^file:\/\//, '')) }]
        : null
    });
    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }
    this.notify('initialized', {});
    this.initialized = true;
    this.capabilities =
      (result.result && result.result.capabilities) || {};
    return result.result;
  }

  async stop() {
    if (!this.child) return;
    try {
      if (this.initialized) {
        await this.request('shutdown', null).catch(() => {});
        this.notify('exit', undefined);
      }
    } catch (_) {
      /* ignore */
    }
    const child = this.child;
    this.child = null;
    try {
      child.kill('SIGTERM');
    } catch (_) {
      /* ignore */
    }
    setTimeout(() => {
      try {
        if (!child.killed) child.kill('SIGKILL');
      } catch (_) {
        /* ignore */
      }
    }, 2000);
  }
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { type } = msg;

  if (type === 'ping') {
    post({ type: 'pong', pid: process.pid });
    return;
  }

  if (type === 'start-server') {
    const { serverId, command, args, rootUri, cwd, env, initializationOptions } =
      msg;
    if (!serverId || !command) {
      post({
        type: 'server-exit',
        serverId,
        code: -1,
        error: 'start-server requires serverId and command'
      });
      return;
    }
    if (servers.has(serverId)) {
      await servers.get(serverId).stop();
      servers.delete(serverId);
    }
    const session = new ServerSession(serverId, {
      command,
      args: args || [],
      rootUri,
      cwd,
      env,
      initializationOptions
    });
    servers.set(serverId, session);
    session.start();
    try {
      const initResult = await session.initialize();
      post({
        type: 'server-initialized',
        serverId,
        capabilities: initResult && initResult.capabilities,
        pid: session.child && session.child.pid
      });
    } catch (err) {
      post({
        type: 'server-exit',
        serverId,
        code: -1,
        error: err.message,
        stderr: session.lastStderr
      });
      await session.stop();
      servers.delete(serverId);
    }
    return;
  }

  if (type === 'request') {
    const session = servers.get(msg.serverId);
    if (!session) {
      post({
        type: 'response',
        serverId: msg.serverId,
        requestId: msg.requestId,
        error: { message: 'unknown server' }
      });
      return;
    }
    try {
      const result = await session.request(msg.method, msg.params, msg.timeoutMs);
      post({
        type: 'response',
        serverId: msg.serverId,
        requestId: msg.requestId,
        result: result.result,
        error: result.error
      });
    } catch (err) {
      post({
        type: 'response',
        serverId: msg.serverId,
        requestId: msg.requestId,
        error: { message: err.message }
      });
    }
    return;
  }

  if (type === 'notify') {
    const session = servers.get(msg.serverId);
    if (session) session.notify(msg.method, msg.params);
    return;
  }

  if (type === 'stop-server') {
    const session = servers.get(msg.serverId);
    if (session) {
      await session.stop();
      servers.delete(msg.serverId);
    }
    post({ type: 'server-stopped', serverId: msg.serverId });
    return;
  }

  if (type === 'list-servers') {
    const list = [];
    for (const [id, s] of servers) {
      list.push({
        serverId: id,
        state: s.state,
        pid: s.child && s.child.pid,
        restarts: s.restarts
      });
    }
    post({ type: 'server-list', servers: list, requestId: msg.requestId });
    return;
  }

  if (type === 'shutdown') {
    for (const [, s] of servers) {
      await s.stop();
    }
    servers.clear();
    post({ type: 'host-shutdown' });
    process.exit(0);
  }
}

function onMessage(msg) {
  Promise.resolve(handleMessage(msg)).catch(err => {
    post({ type: 'host-error', error: err.message, stack: err.stack });
  });
}

if (process.parentPort && typeof process.parentPort.on === 'function') {
  process.parentPort.on('message', onMessage);
} else {
  process.on('message', onMessage);
}

post({ type: 'host-booted', pid: process.pid });
