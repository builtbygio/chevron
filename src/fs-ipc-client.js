'use strict';

/**
 * Renderer client for Phase N2.2–N2.3 filesystem IPC.
 * Packages should prefer atom.applicationDelegate.* over raw fs.
 */

const {ipcRenderer} = require('electron');

// Resolved on first use, not at load. This module is reached from the preload,
// which runs before anything teaches require about .ts — and package-profiler
// is TypeScript. In a packaged app there is a compiled .js beside it so the
// eager require worked; running from a source tree, as the spec runner does,
// it threw and took the whole preload down with it.
let profilerModule;
function getProfiler() {
  if (profilerModule === undefined) {
    try {
      profilerModule = require('./package-profiler').profiler;
    } catch (error) {
      profilerModule = null;
    }
  }
  return profilerModule;
}

// Blocking round trips are the expensive kind, and the call site cannot see
// who asked, so they are attributed to whichever callback is running.
function timed(fn) {
  const profiler = getProfiler();
  if (!profiler || !profiler.enabled) return fn();
  const started = performance.now();
  try {
    return fn();
  } finally {
    const profiler = getProfiler();
    if (profiler) profiler.recordCurrent('ipc', performance.now() - started);
  }
}

function call(channel, ...args) {
  const result = timed(() => ipcRenderer.sendSync(channel, ...args));
  if (!result || result.ok === false) {
    const err = new Error(
      (result && result.error) || `fs ipc failed: ${channel}`
    );
    if (result && result.code) err.code = result.code;
    throw err;
  }
  return result.value;
}

function wrapStat(plain) {
  if (!plain) return plain;
  return {
    isFile: () => !!plain.isFile,
    isDirectory: () => !!plain.isDirectory,
    isSymbolicLink: () => !!plain.isSymbolicLink,
    mode: plain.mode,
    size: plain.size,
    ino: plain.ino,
    dev: plain.dev,
    mtimeMs: plain.mtimeMs,
    ctimeMs: plain.ctimeMs,
    atimeMs: plain.atimeMs,
    mtime: plain.mtimeMs != null ? new Date(plain.mtimeMs) : undefined,
    ctime: plain.ctimeMs != null ? new Date(plain.ctimeMs) : undefined,
    atime: plain.atimeMs != null ? new Date(plain.atimeMs) : undefined
  };
}

module.exports = {
  existsSync(fullPath) {
    return call('chevron:fs-exists-sync', fullPath);
  },

  pathKind(fullPath) {
    // Returns a bare string rather than the {ok, value} envelope, so it does
    // not go through call().
    return timed(() => ipcRenderer.sendSync('chevron:fs-path-kind-sync', fullPath));
  },

  isDirectorySync(fullPath) {
    return this.pathKind(fullPath) === 'directory';
  },

  isFileSync(fullPath) {
    return this.pathKind(fullPath) === 'file';
  },

  isSymbolicLinkSync(fullPath) {
    return this.pathKind(fullPath) === 'symlink';
  },

  realpathSync(fullPath) {
    return ipcRenderer.sendSync('chevron:fs-realpath-sync', fullPath);
  },

  statSync(fullPath) {
    return wrapStat(call('chevron:fs-stat-sync', fullPath, true));
  },

  lstatSync(fullPath) {
    return wrapStat(call('chevron:fs-stat-sync', fullPath, false));
  },

  lstatSyncNoException(fullPath) {
    const result = ipcRenderer.sendSync(
      'chevron:fs-stat-no-exception-sync',
      fullPath,
      false
    );
    if (!result || !result.ok || result.value === false) return false;
    return wrapStat(result.value);
  },

  statSyncNoException(fullPath) {
    const result = ipcRenderer.sendSync(
      'chevron:fs-stat-no-exception-sync',
      fullPath,
      true
    );
    if (!result || !result.ok || result.value === false) return false;
    return wrapStat(result.value);
  },

  readdirSync(fullPath) {
    return call('chevron:fs-readdir-sync', fullPath);
  },

  listSync(fullPath) {
    return call('chevron:fs-list-sync', fullPath);
  },

  makeTreeSync(fullPath) {
    return call('chevron:fs-mkdirp-sync', fullPath);
  },

  writeFileSync(fullPath, data, encoding) {
    return call('chevron:fs-write-file-sync', fullPath, data, encoding);
  },

  readFileSync(fullPath, encoding) {
    return call('chevron:fs-read-file-sync', fullPath, encoding);
  },

  copySync(src, dest) {
    return call('chevron:fs-copy-sync', src, dest);
  },

  moveSync(src, dest) {
    return call('chevron:fs-move-sync', src, dest);
  },

  renameSync(src, dest) {
    return call('chevron:fs-rename-sync', src, dest);
  },

  rmdirSync(fullPath) {
    return call('chevron:fs-rmdir-sync', fullPath);
  }
};
