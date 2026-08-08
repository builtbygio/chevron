'use strict';

/**
 * Optional rust-analyzer package — install via cpm (Phase 5).
 *   cpm install ./packages/chevron-lsp-rust
 * Binary is fetched by cpm language-server prebuild (not in the product installer).
 */

const path = require('path');
const { CompositeDisposable } = require('event-kit');
const { registerWithLsp } = require('./resolve');

const PACKAGE_ROOT = path.join(__dirname, '..');
let disposables = null;

module.exports = {
  activate() {
    disposables = new CompositeDisposable();
  },

  deactivate() {
    if (disposables) disposables.dispose();
    disposables = null;
  },

  consumeLsp(lsp) {
    if (!disposables) disposables = new CompositeDisposable();
    try {
      const d = registerWithLsp(lsp, PACKAGE_ROOT);
      if (d && d.dispose) disposables.add(d);
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[chevron-lsp-rust]', err.message);
      }
    }
  }
};
