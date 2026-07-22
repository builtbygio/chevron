'use strict';

/**
 * Renderer client for Phase N2.2–N2.3 filesystem IPC.
 * Packages should prefer atom.applicationDelegate.* over raw fs.
 */

const {ipcRenderer} = require('electron');

function call(channel, ...args) {
  const result = ipcRenderer.sendSync(channel, ...args);
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
    return call('atom-fs-exists-sync', fullPath);
  },

  pathKind(fullPath) {
    return ipcRenderer.sendSync('atom-fs-path-kind-sync', fullPath);
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
    return ipcRenderer.sendSync('atom-fs-realpath-sync', fullPath);
  },

  statSync(fullPath) {
    return wrapStat(call('atom-fs-stat-sync', fullPath, true));
  },

  lstatSync(fullPath) {
    return wrapStat(call('atom-fs-stat-sync', fullPath, false));
  },

  lstatSyncNoException(fullPath) {
    const result = ipcRenderer.sendSync(
      'atom-fs-stat-no-exception-sync',
      fullPath,
      false
    );
    if (!result || !result.ok || result.value === false) return false;
    return wrapStat(result.value);
  },

  statSyncNoException(fullPath) {
    const result = ipcRenderer.sendSync(
      'atom-fs-stat-no-exception-sync',
      fullPath,
      true
    );
    if (!result || !result.ok || result.value === false) return false;
    return wrapStat(result.value);
  },

  readdirSync(fullPath) {
    return call('atom-fs-readdir-sync', fullPath);
  },

  listSync(fullPath) {
    return call('atom-fs-list-sync', fullPath);
  },

  makeTreeSync(fullPath) {
    return call('atom-fs-mkdirp-sync', fullPath);
  },

  writeFileSync(fullPath, data, encoding) {
    return call('atom-fs-write-file-sync', fullPath, data, encoding);
  },

  readFileSync(fullPath, encoding) {
    return call('atom-fs-read-file-sync', fullPath, encoding);
  },

  copySync(src, dest) {
    return call('atom-fs-copy-sync', src, dest);
  },

  moveSync(src, dest) {
    return call('atom-fs-move-sync', src, dest);
  },

  renameSync(src, dest) {
    return call('atom-fs-rename-sync', src, dest);
  },

  rmdirSync(fullPath) {
    return call('atom-fs-rmdir-sync', fullPath);
  }
};
