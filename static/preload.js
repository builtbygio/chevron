'use strict';

/**
 * Preload entry for contextIsolation.
 *
 * Electron isolates the page world from Node when contextIsolation is true.
 * Atom (and packages) still need require/fs/natives, so the entire renderer
 * bootstrap runs here in the preload world — which has Node + Electron and
 * shares the same DOM as the page.
 *
 * The page (index.html) intentionally loads no Node scripts.
 */

// Ensure electron.remote is the IPC compat layer before any package loads.
const electron = require('electron');
if (!electron.remote) {
  electron.remote = require('../src/remote-compat');
}

// Boot the historical renderer entry (sets window.onload → Atom).
require('./index.js');
