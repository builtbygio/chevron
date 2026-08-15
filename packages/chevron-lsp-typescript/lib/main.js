'use strict';

/**
 * Optional TypeScript LS package — install via cpm (Phase 5).
 *   cpm install ./packages/chevron-lsp-typescript
 *
 * This package is a binary distributor. Core `builtin-servers` discovers
 * `node_modules/.bin/typescript-language-server` under $CHEVRON_HOME/packages.
 * Do not require('event-kit') or 'fs' here: this folder is a T2 user package.
 */

const path = require('path');

const PACKAGE_ROOT = path.join(__dirname, '..');
const BIN = path.join(
  PACKAGE_ROOT,
  'node_modules',
  '.bin',
  'typescript-language-server'
);

const SCOPES = [
  'source.ts',
  'source.tsx',
  'source.js',
  'source.js.jsx',
  'source.jsx',
  'source.flow'
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
        id: 'typescript',
        scopes: SCOPES,
        command: BIN,
        args: ['--stdio']
      });
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[chevron-lsp-typescript]', err && err.message);
      }
    }
  }
};
