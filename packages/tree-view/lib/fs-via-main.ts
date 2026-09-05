'use strict';

// Disk I/O → atom.applicationDelegate (main-process IPC, absolute paths only).
// String/path helpers remain on fs-plus (no disk).
//
// The generator this file once named is gone; it is maintained by hand now.
// What it stands in for is fs-plus, so where fs-plus does more than node's fs
// this has to do the same — see writeFileSync and copySync below.

const nodePath = require('path');
const pathFs = require('fs-plus');

function d() {
  if (typeof chevron === 'undefined' || !chevron.applicationDelegate) {
    throw new Error('tree-view fs-via-main: atom.applicationDelegate unavailable');
  }
  return chevron.applicationDelegate;
}

function realpathOrSelf(p) {
  return d().realpathSync(p) || p;
}

module.exports = {
  existsSync(p) {
    return d().existsSync(p);
  },
  isFileSync(p) {
    return d().isFileSync(p);
  },
  isDirectorySync(p) {
    return d().isDirectorySync(p);
  },
  isSymbolicLinkSync(p) {
    return d().isSymbolicLinkSync(p);
  },
  realpathSync(p) {
    return realpathOrSelf(p);
  },
  realpath(p, cb) {
    try {
      const r = realpathOrSelf(p);
      process.nextTick(() => cb(null, r));
    } catch (error) {
      process.nextTick(() => cb(error));
    }
  },
  makeTreeSync(p) {
    return d().makeTreeSync(p);
  },
  writeFileSync(p, data, encoding) {
    // fs-plus mkdirp'd the parent directory here, and the tree-view depends
    // on it: naming a folder that does not exist yet is the ordinary way to
    // make one from the Add File dialog. Without it the write is an ENOENT.
    d().makeTreeSync(nodePath.dirname(p));
    return d().writeFileSync(p, data, encoding);
  },
  readFileSync(p, encoding) {
    return d().readFileSync(p, encoding);
  },
  copySync(src, dest) {
    // Same as writeFileSync: fs-plus made the destination directory first.
    d().makeTreeSync(nodePath.dirname(dest));
    return d().copySync(src, dest);
  },
  copy(src, dest, cb) {
    try {
      d().copySync(src, dest);
      if (typeof cb === 'function') process.nextTick(cb);
    } catch (error) {
      if (typeof cb === 'function') process.nextTick(() => cb(error));
      else throw error;
    }
  },
  moveSync(src, dest) {
    return d().moveSync(src, dest);
  },
  renameSync(src, dest) {
    return d().renameSync(src, dest);
  },
  readdirSync(p) {
    return d().readdirSync(p);
  },
  listSync(p) {
    return d().listSync(p);
  },
  rmdirSync(p) {
    return d().rmdirSync(p);
  },
  statSync(p) {
    return d().statSync(p);
  },
  lstatSyncNoException(p) {
    return d().lstatSyncNoException(p);
  },
  statSyncNoException(p) {
    return d().statSyncNoException(p);
  },
  // Pure helpers (no disk)
  isCaseInsensitive() {
    return pathFs.isCaseInsensitive();
  },
  isReadmePath(p) {
    return pathFs.isReadmePath(p);
  },
  isCompressedExtension(ext) {
    return pathFs.isCompressedExtension(ext);
  },
  isImageExtension(ext) {
    return pathFs.isImageExtension(ext);
  },
  isPdfExtension(ext) {
    return pathFs.isPdfExtension(ext);
  },
  isBinaryExtension(ext) {
    return pathFs.isBinaryExtension(ext);
  }
};
