'use strict';

/**
 * Phase N2.2–N2.3: confined filesystem IPC for bundled packages.
 * Absolute paths only (null-byte free). Mutations and probes both go through main.
 */

const fs = require('fs');
const path = require('path');
const {ipcMain} = require('electron');

const READ_FILE_MAX_BYTES = 64 * 1024 * 1024; // 64 MiB cap for sync read/copy path

function isSafeAbsolutePath(fullPath) {
  if (typeof fullPath !== 'string' || fullPath.length === 0) return false;
  if (fullPath.includes('\0')) return false;
  return path.isAbsolute(fullPath);
}

function deny(event, channel, fullPath) {
  console.warn(`${channel}: blocked path ${String(fullPath)}`);
  event.returnValue = {ok: false, error: 'invalid-path', code: 'EINVAL'};
}

function ok(event, value) {
  event.returnValue = {ok: true, value};
}

function fail(event, error) {
  event.returnValue = {
    ok: false,
    error: error && error.message ? error.message : String(error),
    code: error && error.code
  };
}

function serializeStat(st) {
  if (!st) return null;
  return {
    isFile: st.isFile(),
    isDirectory: st.isDirectory(),
    isSymbolicLink: st.isSymbolicLink(),
    mode: st.mode,
    size: st.size,
    ino: st.ino,
    dev: st.dev,
    mtimeMs: st.mtimeMs,
    ctimeMs: st.ctimeMs,
    atimeMs: st.atimeMs
  };
}

function copyPathSync(src, dest) {
  const st = fs.lstatSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, {recursive: true});
    for (const name of fs.readdirSync(src)) {
      copyPathSync(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  if (st.isSymbolicLink()) {
    const target = fs.readlinkSync(src);
    fs.symlinkSync(target, dest);
    return;
  }
  fs.copyFileSync(src, dest);
}

let registered = false;

module.exports = function registerFsIpc() {
  if (registered) return;
  registered = true;

  // --- probes ---------------------------------------------------------------

  ipcMain.on('atom-fs-exists-sync', (event, fullPath) => {
    if (!isSafeAbsolutePath(fullPath)) return deny(event, 'atom-fs-exists-sync', fullPath);
    try {
      ok(event, fs.existsSync(fullPath));
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('atom-fs-path-kind-sync', (event, fullPath) => {
    if (!isSafeAbsolutePath(fullPath)) {
      console.warn(`atom-fs-path-kind-sync: blocked path ${String(fullPath)}`);
      event.returnValue = null;
      return;
    }
    try {
      const st = fs.lstatSync(fullPath);
      if (st.isSymbolicLink()) event.returnValue = 'symlink';
      else if (st.isDirectory()) event.returnValue = 'directory';
      else if (st.isFile()) event.returnValue = 'file';
      else event.returnValue = 'other';
    } catch (error) {
      event.returnValue = null;
    }
  });

  ipcMain.on('atom-fs-realpath-sync', (event, fullPath) => {
    if (!isSafeAbsolutePath(fullPath)) {
      console.warn(`atom-fs-realpath-sync: blocked path ${String(fullPath)}`);
      event.returnValue = null;
      return;
    }
    try {
      event.returnValue = fs.realpathSync(fullPath);
    } catch (error) {
      event.returnValue = null;
    }
  });

  ipcMain.on('atom-fs-stat-sync', (event, fullPath, followLinks) => {
    if (!isSafeAbsolutePath(fullPath)) return deny(event, 'atom-fs-stat-sync', fullPath);
    try {
      const st = followLinks ? fs.statSync(fullPath) : fs.lstatSync(fullPath);
      ok(event, serializeStat(st));
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('atom-fs-stat-no-exception-sync', (event, fullPath, followLinks) => {
    if (!isSafeAbsolutePath(fullPath)) {
      event.returnValue = {ok: true, value: false};
      return;
    }
    try {
      const st = followLinks ? fs.statSync(fullPath) : fs.lstatSync(fullPath);
      ok(event, serializeStat(st));
    } catch (error) {
      ok(event, false);
    }
  });

  ipcMain.on('atom-fs-readdir-sync', (event, fullPath) => {
    if (!isSafeAbsolutePath(fullPath)) return deny(event, 'atom-fs-readdir-sync', fullPath);
    try {
      ok(event, fs.readdirSync(fullPath));
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('atom-fs-list-sync', (event, fullPath) => {
    // fs-plus listSync: full paths of entries
    if (!isSafeAbsolutePath(fullPath)) return deny(event, 'atom-fs-list-sync', fullPath);
    try {
      const names = fs.readdirSync(fullPath);
      ok(event, names.map(name => path.join(fullPath, name)));
    } catch (error) {
      fail(event, error);
    }
  });

  // --- mutations ------------------------------------------------------------

  ipcMain.on('atom-fs-mkdirp-sync', (event, fullPath) => {
    if (!isSafeAbsolutePath(fullPath)) return deny(event, 'atom-fs-mkdirp-sync', fullPath);
    try {
      fs.mkdirSync(fullPath, {recursive: true});
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('atom-fs-write-file-sync', (event, fullPath, data, encoding) => {
    if (!isSafeAbsolutePath(fullPath)) return deny(event, 'atom-fs-write-file-sync', fullPath);
    try {
      if (encoding) fs.writeFileSync(fullPath, data, encoding);
      else fs.writeFileSync(fullPath, data);
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('atom-fs-read-file-sync', (event, fullPath, encoding) => {
    if (!isSafeAbsolutePath(fullPath)) return deny(event, 'atom-fs-read-file-sync', fullPath);
    try {
      const st = fs.statSync(fullPath);
      if (st.size > READ_FILE_MAX_BYTES) {
        fail(event, Object.assign(new Error('file too large'), {code: 'EFBIG'}));
        return;
      }
      const buf = encoding
        ? fs.readFileSync(fullPath, encoding)
        : fs.readFileSync(fullPath);
      ok(event, buf);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('atom-fs-copy-sync', (event, src, dest) => {
    if (!isSafeAbsolutePath(src) || !isSafeAbsolutePath(dest)) {
      return deny(event, 'atom-fs-copy-sync', `${src} -> ${dest}`);
    }
    try {
      copyPathSync(src, dest);
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('atom-fs-move-sync', (event, src, dest) => {
    if (!isSafeAbsolutePath(src) || !isSafeAbsolutePath(dest)) {
      return deny(event, 'atom-fs-move-sync', `${src} -> ${dest}`);
    }
    try {
      fs.renameSync(src, dest);
      ok(event, true);
    } catch (error) {
      // Cross-device: copy + unlink
      try {
        copyPathSync(src, dest);
        fs.rmSync(src, {recursive: true, force: true});
        ok(event, true);
      } catch (error2) {
        fail(event, error2);
      }
    }
  });

  ipcMain.on('atom-fs-rename-sync', (event, src, dest) => {
    if (!isSafeAbsolutePath(src) || !isSafeAbsolutePath(dest)) {
      return deny(event, 'atom-fs-rename-sync', `${src} -> ${dest}`);
    }
    try {
      fs.renameSync(src, dest);
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('atom-fs-rmdir-sync', (event, fullPath) => {
    if (!isSafeAbsolutePath(fullPath)) return deny(event, 'atom-fs-rmdir-sync', fullPath);
    try {
      fs.rmdirSync(fullPath);
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });
};
