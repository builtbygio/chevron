'use strict';

/**
 * Optional prose language server (harper-ls) — install via cpm.
 *
 * Covers Markdown and plain text: grammar, spelling and style, offline. There
 * is no language server for plain text as such; this is the one that makes
 * text.plain worth serving, and it picks up source.gfm at the same time.
 *
 * Binary distributor only. Core discovers the install under $CHEVRON_HOME.
 * Do not require('event-kit') or 'fs' — this is a T2 user package.
 */

const path = require('path');

const BIN = path.join(__dirname, '..', 'bin', 'harper-ls');

let registration = null;

module.exports = {
  activate() {},

  deactivate() {
    if (registration && typeof registration.dispose === 'function') {
      registration.dispose();
    }
    registration = null;
  },

  consumeLsp(lsp) {
    if (!lsp || typeof lsp.registerServer !== 'function') return;
    try {
      registration = lsp.registerServer({
        id: 'harper-ls',
        scopes: ['source.gfm', 'text.plain'],
        command: BIN,
        args: ['--stdio']
      });
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[chevron-lsp-markdown]', err && err.message);
      }
    }
  }
};
