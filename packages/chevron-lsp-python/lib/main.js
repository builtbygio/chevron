'use strict';

/**
 * Optional Pyright package — install via cpm (Phase 5).
 * Binary distributor only. Core discovers the install under $CHEVRON_HOME.
 * Do not require('event-kit') or 'fs' — this is a T2 user package.
 */

const path = require('path');

const BIN = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  'pyright-langserver'
);

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
        id: 'pyright',
        scopes: ['source.python'],
        command: BIN,
        args: ['--stdio']
      });
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[chevron-lsp-python]', err && err.message);
      }
    }
  }
};
