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

/** Max unexpected restarts within the window before giving up. */
const RESTART_MAX = 3;
const RESTART_WINDOW_MS = 5 * 60 * 1000;
/** Default idle shutdown: 10 minutes without client traffic. */
const DEFAULT_IDLE_MS = 10 * 60 * 1000;

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
    this.restartHistory = [];
    this.lastStderr = '';
    this.initialized = false;
    this.intentionalStop = false;
    this._exitHandled = false;
    this.lastActivityAt = Date.now();
    this.idleTimeoutMs =
      config.idleTimeoutMs != null ? config.idleTimeoutMs : DEFAULT_IDLE_MS;
    this._idleTimer = null;
    this._armIdleTimer();
  }

  touch() {
    this.lastActivityAt = Date.now();
    this._armIdleTimer();
  }

  _armIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
    if (!this.idleTimeoutMs || this.idleTimeoutMs <= 0) return;
    this._idleTimer = setTimeout(() => {
      this._idleShutdown().catch(() => {});
    }, this.idleTimeoutMs);
    if (this._idleTimer.unref) this._idleTimer.unref();
  }

  async _idleShutdown() {
    if (this.intentionalStop || this.state === 'exited') return;
    post({
      type: 'server-idle-shutdown',
      serverId: this.id,
      idleTimeoutMs: this.idleTimeoutMs
    });
    this.intentionalStop = true;
    await this.stop();
    servers.delete(this.id);
    post({
      type: 'server-exit',
      serverId: this.id,
      code: 0,
      reason: 'idle',
      intentional: true,
      willRestart: false
    });
  }

  start() {
    const { command, args = [], env, cwd } = this.config;
    this._exitHandled = false;
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
        error: err.message,
        willRestart: false
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
      // 'exit' usually follows; only surface if process never spawned
      if (!this.child || !this.child.pid) {
        this._handleUnexpectedExit(-1, null, err.message);
      }
    });
    this.child.on('exit', (code, signal) => {
      this._handleUnexpectedExit(code, signal, null);
    });

    post({
      type: 'server-ready',
      serverId: this.id,
      pid: this.child.pid,
      state: this.state
    });
  }

  _handleUnexpectedExit(code, signal, errorMessage) {
    if (this._exitHandled) return;
    this._exitHandled = true;
    this.state = 'exited';
    this.child = null;
    for (const [, p] of this.pending) {
      p.reject(
        new Error(
          errorMessage || `server exited code=${code} signal=${signal}`
        )
      );
    }
    this.pending.clear();

    if (this.intentionalStop) {
      post({
        type: 'server-exit',
        serverId: this.id,
        code,
        signal,
        error: errorMessage || undefined,
        stderr: this.lastStderr,
        intentional: true,
        willRestart: false
      });
      return;
    }

    const now = Date.now();
    this.restartHistory = this.restartHistory.filter(
      t => now - t < RESTART_WINDOW_MS
    );
    if (this.restartHistory.length >= RESTART_MAX) {
      post({
        type: 'server-exit',
        serverId: this.id,
        code,
        signal,
        error:
          errorMessage ||
          `restart storm: ${RESTART_MAX} restarts within ${RESTART_WINDOW_MS / 60000} min`,
        stderr: this.lastStderr,
        willRestart: false,
        storm: true
      });
      servers.delete(this.id);
      return;
    }

    const delayMs = Math.min(1000 * Math.pow(2, this.restarts), 8000);
    this.restarts += 1;
    this.restartHistory.push(now);
    post({
      type: 'server-restarting',
      serverId: this.id,
      attempt: this.restarts,
      delayMs,
      code,
      signal,
      error: errorMessage || undefined,
      stderr: this.lastStderr
    });
    post({
      type: 'server-exit',
      serverId: this.id,
      code,
      signal,
      error: errorMessage || undefined,
      stderr: this.lastStderr,
      willRestart: true,
      attempt: this.restarts,
      delayMs
    });

    setTimeout(() => {
      this._restartAfterCrash().catch(err => {
        post({
          type: 'server-exit',
          serverId: this.id,
          code: -1,
          error: err.message,
          stderr: this.lastStderr,
          willRestart: false
        });
        servers.delete(this.id);
      });
    }, delayMs);
  }

  async _restartAfterCrash() {
    this.decoder = new LspFrameDecoder();
    this.pending.clear();
    this.initialized = false;
    this.nextId = 1;
    this.start();
    if (this.state !== 'running') {
      throw new Error('failed to respawn language server');
    }
    const initResult = await this.initialize();
    this.touch();
    post({
      type: 'server-initialized',
      serverId: this.id,
      capabilities: initResult && initResult.capabilities,
      positionEncoding: this.positionEncoding || 'utf-16',
      pid: this.child && this.child.pid,
      restarted: true,
      restarts: this.restarts
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
      } else if (msg.method && msg.id != null) {
        // Server → client request (e.g. workspace/applyEdit)
        post({
          type: 'server-request',
          serverId: this.id,
          id: msg.id,
          method: msg.method,
          params: msg.params
        });
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

  respond(id, result, error) {
    if (!this.child || !this.child.stdin.writable) return;
    if (error) {
      this.child.stdin.write(
        encodeMessage({ jsonrpc: '2.0', id, error })
      );
    } else {
      this.child.stdin.write(
        encodeMessage({ jsonrpc: '2.0', id, result })
      );
    }
  }

  request(method, params, timeoutMs = 30000) {
    if (!this.child || !this.child.stdin.writable) {
      return Promise.reject(new Error('server not running'));
    }
    this.touch();
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
    this.touch();
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
          references: { dynamicRegistration: false },
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true }
            }
          },
          completion: {
            completionItem: {
              snippetSupport: true,
              documentationFormat: ['markdown', 'plaintext']
            }
          },
          rename: { prepareSupport: true },
          codeAction: {
            codeActionLiteralSupport: {
              codeActionKind: {
                valueSet: [
                  '',
                  'quickfix',
                  'refactor',
                  'refactor.extract',
                  'refactor.inline',
                  'refactor.rewrite',
                  'source',
                  'source.organizeImports'
                ]
              }
            },
            resolveSupport: { properties: ['edit'] }
          },
          formatting: { dynamicRegistration: false },
          rangeFormatting: { dynamicRegistration: false },
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true
          }
        },
        workspace: {
          workspaceFolders: true,
          applyEdit: true,
          workspaceEdit: {
            documentChanges: true
          }
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
    // LSP 3.17 positionEncoding negotiation (prefer utf-16 when server omits)
    this.positionEncoding =
      (result.result && result.result.positionEncoding) || 'utf-16';
    return result.result;
  }

  async stop() {
    this.intentionalStop = true;
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
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
        if (child && !child.killed) child.kill('SIGKILL');
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
      const prev = servers.get(serverId);
      prev.intentionalStop = true;
      await prev.stop();
      servers.delete(serverId);
    }
    const session = new ServerSession(serverId, {
      command,
      args: args || [],
      rootUri,
      cwd,
      env,
      initializationOptions,
      idleTimeoutMs: msg.idleTimeoutMs
    });
    servers.set(serverId, session);
    session.start();
    try {
      const initResult = await session.initialize();
      session.touch();
      post({
        type: 'server-initialized',
        serverId,
        capabilities: initResult && initResult.capabilities,
        positionEncoding: session.positionEncoding || 'utf-16',
        pid: session.child && session.child.pid
      });
    } catch (err) {
      post({
        type: 'server-exit',
        serverId,
        code: -1,
        error: err.message,
        stderr: session.lastStderr,
        willRestart: false
      });
      session.intentionalStop = true;
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

  if (type === 'server-response') {
    const session = servers.get(msg.serverId);
    if (session) {
      session.respond(msg.id, msg.result, msg.error);
    }
    return;
  }

  if (type === 'stop-server') {
    const session = servers.get(msg.serverId);
    if (session) {
      session.intentionalStop = true;
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
        restarts: s.restarts,
        lastActivityAt: s.lastActivityAt,
        idleTimeoutMs: s.idleTimeoutMs
      });
    }
    post({ type: 'server-list', servers: list, requestId: msg.requestId });
    return;
  }

  if (type === 'shutdown') {
    for (const [, s] of servers) {
      s.intentionalStop = true;
      await s.stop();
    }
    servers.clear();
    post({ type: 'host-shutdown' });
    process.exit(0);
  }
}

// Test hooks (Node fork unit tests)
module.exports = {
  RESTART_MAX,
  RESTART_WINDOW_MS,
  DEFAULT_IDLE_MS
};

function onMessage(msg) {
  Promise.resolve(handleMessage(msg)).catch(err => {
    post({ type: 'host-error', error: err.message, stack: err.stack });
  });
}

if (process.parentPort && typeof process.parentPort.on === 'function') {
  // utilityProcess delivers a MessageEvent, not the message: without the
  // unwrap every branch of handleMessage misses and the host answers nothing.
  // It still posts host-booted, so the manager believed it was talking to a
  // live host and every request timed out.
  process.parentPort.on('message', event => {
    onMessage(event && event.data !== undefined ? event.data : event);
  });
} else {
  // node:child_process fork, in tests.
  process.on('message', onMessage);
}

post({ type: 'host-booted', pid: process.pid });
