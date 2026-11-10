'use strict';

/**
 * The editor's side of a DAP session: numbered requests, and the handshake
 * that launches a program and plants breakpoints before it runs.
 */

class DebugClient {
  constructor(send, onEvent) {
    this.send = send;
    this.onEvent = onEvent || (() => {});
    this.seq = 1;
    this.pending = new Map();
    this.initialized = new Promise(resolve => {
      this._markInitialized = resolve;
    });
  }

  request(command, args) {
    const seq = this.seq++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`${command} timed out`));
      }, 15000);
      this.pending.set(seq, {
        resolve: body => {
          clearTimeout(timer);
          resolve(body);
        },
        reject: error => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.send({ seq, type: 'request', command, arguments: args || {} });
    });
  }

  receive(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'response') {
      const waiter = this.pending.get(message.request_seq);
      if (!waiter) return;
      this.pending.delete(message.request_seq);
      if (message.success === false) {
        waiter.reject(new Error(message.message || 'debug request failed'));
      } else {
        waiter.resolve(message.body || {});
      }
      return;
    }
    if (message.type === 'event') {
      if (message.event === 'initialized' && this._markInitialized) {
        this._markInitialized();
        this._markInitialized = null;
      }
      this.onEvent(message);
    }
  }

  async launch(program, breakpoints) {
    await this.request('initialize', { adapterID: 'chevron-node' });
    await this.request('launch', { program });
    await this.initialized;
    const byFile = new Map();
    for (const bp of breakpoints || []) {
      const list = byFile.get(bp.path) || [];
      list.push({ line: bp.line });
      byFile.set(bp.path, list);
    }
    for (const [file, lines] of byFile) {
      await this.request('setBreakpoints', {
        source: { path: file },
        breakpoints: lines
      });
    }
    await this.request('configurationDone');
  }
}

module.exports = { DebugClient };
