'use strict';

/**
 * Optional rust-analyzer package — install via cpm (Phase 5).
 * Binary distributor only. Core discovers the install under $CHEVRON_HOME.
 * Do not require('event-kit') or 'fs' — this is a T2 user package.
 */

const path = require('path');

const CANDIDATES = [
  path.join(__dirname, '..', 'bin', 'rust-analyzer'),
  path.join(__dirname, '..', 'node_modules', '.bin', 'rust-analyzer')
];

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
        id: 'rust-analyzer',
        scopes: ['source.rust'],
        command: CANDIDATES[0],
        args: []
      });
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[chevron-lsp-rust]', err && err.message);
      }
    }
  }
};
