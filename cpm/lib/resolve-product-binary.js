'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Resolve Chevron/Electron product executable for ELECTRON_RUN_AS_NODE.
 */
function resolveProductBinary(repoRoot) {
  if (process.env.CHEVRON_EXECUTABLE && fs.existsSync(process.env.CHEVRON_EXECUTABLE)) {
    return process.env.CHEVRON_EXECUTABLE;
  }
  if (process.env.ELECTRON_PATH && fs.existsSync(process.env.ELECTRON_PATH)) {
    return process.env.ELECTRON_PATH;
  }
  if (process.env.ATOM_ELECTRON_PATH && fs.existsSync(process.env.ATOM_ELECTRON_PATH)) {
    return process.env.ATOM_ELECTRON_PATH;
  }

  // Packaged: launchers live under resources; product is nearby.
  // Dev: prefer out/Chevron.app or electron from node_modules.
  const root = repoRoot || path.resolve(__dirname, '..', '..');

  if (process.platform === 'darwin') {
    const candidates = [
      path.join(root, 'out', 'Chevron.app', 'Contents', 'MacOS', 'Chevron'),
      path.join(root, 'out', 'Atom.app', 'Contents', 'MacOS', 'Atom')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } else if (process.platform === 'win32') {
    const candidates = [
      path.join(root, 'out', 'Chevron-win32-x64', 'Chevron.exe'),
      path.join(root, 'out', 'chevron.exe'),
      path.join(root, 'out', 'Atom.exe')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } else {
    const candidates = [
      path.join(root, 'out', 'Chevron-linux-x64', 'chevron'),
      path.join(root, 'out', 'chevron'),
      path.join(root, 'out', 'atom')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // electron npm package (dev host Node fallback — wrong ABI for natives, but ok for pure JS)
  try {
    const electron = require(path.join(root, 'node_modules', 'electron'));
    if (typeof electron === 'string' && fs.existsSync(electron)) return electron;
  } catch (_) {
    /* ignore */
  }

  return null;
}

module.exports = { resolveProductBinary };
