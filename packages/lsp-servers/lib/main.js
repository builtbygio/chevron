'use strict';

/**
 * Owned package that registers language servers through chevron.lsp —
 * no core edits required (Phase 3 success criterion).
 *
 * Binaries must already be on PATH (Chevron does not download servers).
 * Built-in table also lists these; package registration takes precedence.
 */

const { CompositeDisposable } = require('event-kit');

let disposables = null;

const SERVERS = [
  {
    id: 'rust-analyzer',
    scopes: ['source.rust'],
    command: 'rust-analyzer',
    args: []
  },
  {
    id: 'pyright',
    scopes: ['source.python'],
    command: 'pyright-langserver',
    args: ['--stdio']
  }
];

module.exports = {
  activate() {
    disposables = new CompositeDisposable();
  },

  deactivate() {
    if (disposables) disposables.dispose();
    disposables = null;
  },

  /**
   * @param {{ registerServer: Function }} lsp
   */
  consumeLsp(lsp) {
    if (!lsp || typeof lsp.registerServer !== 'function') return;
    if (!disposables) disposables = new CompositeDisposable();

    for (const spec of SERVERS) {
      try {
        const d = lsp.registerServer(spec);
        if (d && d.dispose) disposables.add(d);
      } catch (err) {
        // Soft-fail: binary may not exist; built-in path may still work
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[lsp-servers] register ${spec.id}:`, err.message);
        }
      }
    }
  }
};
