'use strict';

/**
 * Preload entry for contextIsolation (Phase I / N3).
 *
 * Electron isolates the page world from Node when contextIsolation is true.
 * Atom (and packages) still need require/fs/natives, so the entire renderer
 * bootstrap runs here in the preload world — which has Node + Electron and
 * shares the same DOM as the page.
 *
 * Privilege map (do not expand casually):
 * - **Page world:** no Node, no electron, empty shell (static/index.html).
 * - **This preload world:** full Node + electron; boots Atom; loads packages.
 * - **Guest <webview>:** sandboxed, no Node, no this preload (see
 *   AtomWindow will-attach-webview).
 * - **GitHub worker BrowserWindows:** separate Node windows via remote-compat
 *   IPC (still a trusted exception; Phase N later).
 *
 * Natives that keep sandbox:false on the editor window: see
 * `src/preload-natives.js` and docs/security-phase-n3.md.
 *
 * Optional: CHEVRON_AUDIT_PACKAGE_REQUIRES=1 logs privileged package requires.
 * Package policy: docs/package-node-policy.md.
 *
 * The page (index.html) intentionally loads no Node scripts.
 * Do not expose this preload (or Node) via contextBridge to the page world.
 */

// Ensure electron.remote is the IPC compat layer before any package loads.
const electron = require('electron');
if (!electron.remote) {
  electron.remote = require('../src/remote-compat');
}

// Phase N3: optional inventory of privileged requires from package code.
try {
  require('../src/package-require-audit').installPackageRequireAudit();
} catch (error) {
  // Never block boot if audit helper is missing/broken.
  console.warn('package-require-audit install failed', error);
}

// Boot the historical renderer entry (sets window.onload → Atom).
require('./index.js');
