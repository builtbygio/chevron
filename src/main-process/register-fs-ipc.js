'use strict';

/**
 * Phase N2.2–N2.3 + Electron BP P2.1: confined filesystem IPC for packages.
 * Absolute paths only (null-byte free). Optional strict roots (default ON via
 * CHEVRON_FS_IPC_STRICT / core.fsIpcStrict).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ipcMain: electronIpcMain, app, BrowserWindow } = require('electron');
const { withLegacyAliases } = require('./ipc-aliases');
const ipcMain = withLegacyAliases(electronIpcMain);
const { pathContained } = require('./atom-protocol-path');
const guard = require('./ipc-guard');
const { isSafeAbsolutePath } = guard;

const READ_FILE_MAX_BYTES = 64 * 1024 * 1024; // 64 MiB cap for sync read/copy path

let allowedRoots = [];
let allowedRootsReal = [];
let strictMode = true;
let atomApplicationRef = null;

function envStrictDefault() {
  const v = process.env.CHEVRON_FS_IPC_STRICT;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  return true; // default ON
}

function setFsIpcPolicy(options = {}) {
  if (typeof options.strict === 'boolean') strictMode = options.strict;
  if (Array.isArray(options.roots)) {
    allowedRoots = options.roots
      .filter(r => typeof r === 'string' && r.length > 0)
      .map(r => path.resolve(r));
    // Resolved once here: every FS IPC message pays for this comparison.
    allowedRootsReal = allowedRoots.map(root => {
      try {
        return fs.realpathSync(root);
      } catch (error) {
        return root;
      }
    });
  }
}

function collectDefaultRoots(atomApplication) {
  const roots = [];
  if (process.env.ATOM_HOME) roots.push(process.env.ATOM_HOME);
  if (atomApplication && atomApplication.resourcePath) {
    roots.push(atomApplication.resourcePath);
  }
  try {
    roots.push(os.tmpdir());
  } catch (error) {
    /* ignore */
  }
  try {
    if (app && typeof app.getPath === 'function') {
      roots.push(app.getPath('temp'));
      roots.push(app.getPath('userData'));
    }
  } catch (error) {
    /* ignore */
  }
  const windows =
    atomApplication && typeof atomApplication.getAllWindows === 'function'
      ? atomApplication.getAllWindows()
      : atomApplication && Array.isArray(atomApplication.windows)
        ? atomApplication.windows
        : [];
  for (const win of windows) {
    if (win && Array.isArray(win.projectRoots)) {
      for (const r of win.projectRoots) {
        if (r) roots.push(r);
      }
    }
  }
  return roots;
}

function refreshFsIpcRoots() {
  strictMode = envStrictDefault();
  if (
    atomApplicationRef &&
    atomApplicationRef.config &&
    typeof atomApplicationRef.config.get === 'function'
  ) {
    const cfg = atomApplicationRef.config.get('core.fsIpcStrict');
    if (cfg === false) strictMode = false;
    if (cfg === true) strictMode = true;
  }
  setFsIpcPolicy({
    strict: strictMode,
    roots: collectDefaultRoots(atomApplicationRef)
  });
}

// `fullPath` with every symlink followed. A file that does not exist yet has
// no realpath, so the deepest existing ancestor is resolved and the tail put
// back. docs/reference/security-threat-model.md

function resolveThroughLinks(fullPath, depth = 0) {
  let current = path.resolve(fullPath);
  const tail = [];
  const withTail = base =>
    tail.length === 0 ? base : path.join(base, ...tail.slice().reverse());

  for (;;) {
    try {
      return withTail(fs.realpathSync(current));
    } catch (error) {
      // realpathSync gives up on a dangling symlink, but writing through one
      // creates the file it points at, so read the link directly.
      let link = null;
      try {
        if (fs.lstatSync(current).isSymbolicLink()) {
          link = fs.readlinkSync(current);
        }
      } catch (lstatError) {
        // Not a link, just absent.
      }
      if (link !== null) {
        // A loop between links never resolves.
        if (depth >= 20) return path.resolve(fullPath);
        const target = path.resolve(path.dirname(current), link);
        return withTail(resolveThroughLinks(target, depth + 1));
      }
      const parent = path.dirname(current);
      // Nothing on the way up exists, so there is no link to follow.
      if (parent === current) return path.resolve(fullPath);
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

function isAllowedFsPath(fullPath) {
  if (!isSafeAbsolutePath(fullPath)) return false;
  if (!strictMode) return true;
  if (allowedRoots.length === 0) {
    // No roots yet (very early boot) — allow absolute paths until roots exist.
    return true;
  }
  // Where the path lands, not how it was spelled: both sides are resolved, and
  // resolving only one would deny a file by one of its own names.
  const real = resolveThroughLinks(path.resolve(fullPath));
  return allowedRootsReal.some(root => pathContained(root, real));
}

// Tree-view / project open can race a refresh: retry once after collecting
// current window projectRoots.
function isAllowedFsPathOrRefresh(fullPath) {
  if (isAllowedFsPath(fullPath)) return true;
  refreshFsIpcRoots();
  return isAllowedFsPath(fullPath);
}

/**
 * Roots too broad to be a project. Adding one of these would make the strict
 * roots check cover the whole disk, which is the same as switching it off.
 */
function isOverbroadRoot(resolved) {
  if (resolved === path.parse(resolved).root) return true;
  let home = null;
  try {
    home = path.resolve(os.homedir());
  } catch (error) {
    home = null;
  }
  return home !== null && resolved === home;
}

/**
 * What the renderer may declare as this window's project roots.
 *
 * The whole payload is refused rather than filtered: applying half of it
 * would leave the window's roots disagreeing with the renderer's, and the
 * disagreement would show up as unexplained permission errors later.
 *
 * This checks shape and breadth, not provenance. A package can still name any
 * particular directory it likes; what it cannot do is name one that covers
 * everything. Closing that properly means main accepting only roots it
 * offered — see docs/reference/security-threat-model.md.
 */
function validateProjectRoots(projectRootPaths) {
  if (!Array.isArray(projectRootPaths)) {
    return { ok: false, reason: 'project roots must be an array' };
  }
  for (const candidate of projectRootPaths) {
    const check = guard.requireAbsolutePath(candidate, { name: 'project root' });
    if (!check.ok) return check;
    const resolved = path.resolve(candidate);
    if (isOverbroadRoot(resolved)) {
      return { ok: false, reason: `${resolved} is too broad to be a project root` };
    }
  }
  return { ok: true };
}

/** Node accepts these; anything else throws inside fs and reads as a bug. */
const WRITE_ENCODINGS = new Set([
  'utf8', 'utf-8', 'ascii', 'base64', 'base64url', 'binary',
  'hex', 'latin1', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le'
]);

function validateWriteFilePayload(data, encoding) {
  const isBytes =
    Buffer.isBuffer(data) ||
    data instanceof Uint8Array ||
    ArrayBuffer.isView(data);
  if (!isBytes && typeof data !== 'string') {
    return { ok: false, reason: 'data must be a string or bytes' };
  }
  if (encoding !== undefined && encoding !== null) {
    if (typeof encoding !== 'string' || !WRITE_ENCODINGS.has(encoding.toLowerCase())) {
      return { ok: false, reason: `unknown encoding ${String(encoding)}` };
    }
  }
  return { ok: true };
}

function applyProjectRootsFromRenderer(event, projectRootPaths) {
  const paths = Array.isArray(projectRootPaths) ? projectRootPaths : [];
  try {
    const bw =
      event && event.sender ? BrowserWindow.fromWebContents(event.sender) : null;
    const win =
      atomApplicationRef &&
      typeof atomApplicationRef.atomWindowForBrowserWindow === 'function'
        ? atomApplicationRef.atomWindowForBrowserWindow(bw)
        : null;
    if (win && typeof win.setProjectRoots === 'function') {
      win.setProjectRoots(paths);
    } else {
      refreshFsIpcRoots();
      setFsIpcPolicy({
        strict: strictMode,
        roots: collectDefaultRoots(atomApplicationRef).concat(paths)
      });
    }
  } catch (error) {
    refreshFsIpcRoots();
    setFsIpcPolicy({
      strict: strictMode,
      roots: collectDefaultRoots(atomApplicationRef).concat(paths)
    });
  }
}

function deny(event, channel, fullPath) {
  console.warn(`${channel}: blocked path ${String(fullPath)}`);
  event.returnValue = { ok: false, error: 'invalid-path', code: 'EINVAL' };
}

function ok(event, value) {
  event.returnValue = { ok: true, value };
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
    fs.mkdirSync(dest, { recursive: true });
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

module.exports = function registerFsIpc(atomApplication) {
  atomApplicationRef = atomApplication || null;
  refreshFsIpcRoots();

  if (registered) return;
  registered = true;

  // Refresh roots when renderers ask (after projects open).
  ipcMain.on('chevron:fs-refresh-roots-sync', event => {
    refreshFsIpcRoots();
    event.returnValue = { ok: true, strict: strictMode, roots: allowedRoots };
  });

  // Sync: renderer Project.setPaths/addPath must update allowed roots before
  // did-change-paths listeners (tree-view) lstat the new folder.
  ipcMain.on('chevron:window-set-project-roots-sync', (event, projectRootPaths) => {
    const check = validateProjectRoots(projectRootPaths);
    if (!check.ok) {
      console.warn(
        `atom-window-set-project-roots-sync: refused (${check.reason})`
      );
      event.returnValue = {
        ok: false,
        error: check.reason,
        strict: strictMode,
        roots: allowedRoots
      };
      return;
    }
    applyProjectRootsFromRenderer(event, projectRootPaths);
    event.returnValue = { ok: true, strict: strictMode, roots: allowedRoots };
  });

  // --- probes ---------------------------------------------------------------

  ipcMain.on('chevron:fs-exists-sync', (event, fullPath) => {
    if (!isAllowedFsPathOrRefresh(fullPath))
      return deny(event, 'chevron:fs-exists-sync', fullPath);
    try {
      ok(event, fs.existsSync(fullPath));
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('chevron:fs-path-kind-sync', (event, fullPath) => {
    if (!isAllowedFsPathOrRefresh(fullPath)) {
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

  ipcMain.on('chevron:fs-realpath-sync', (event, fullPath) => {
    if (!isAllowedFsPathOrRefresh(fullPath)) {
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

  ipcMain.on('chevron:fs-stat-sync', (event, fullPath, followLinks) => {
    if (!isAllowedFsPathOrRefresh(fullPath))
      return deny(event, 'chevron:fs-stat-sync', fullPath);
    try {
      const st = followLinks ? fs.statSync(fullPath) : fs.lstatSync(fullPath);
      ok(event, serializeStat(st));
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('chevron:fs-stat-no-exception-sync', (event, fullPath, followLinks) => {
    if (!isAllowedFsPathOrRefresh(fullPath)) {
      event.returnValue = { ok: true, value: false };
      return;
    }
    try {
      const st = followLinks ? fs.statSync(fullPath) : fs.lstatSync(fullPath);
      ok(event, serializeStat(st));
    } catch (error) {
      ok(event, false);
    }
  });

  ipcMain.on('chevron:fs-readdir-sync', (event, fullPath) => {
    if (!isAllowedFsPathOrRefresh(fullPath))
      return deny(event, 'chevron:fs-readdir-sync', fullPath);
    try {
      ok(event, fs.readdirSync(fullPath));
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('chevron:fs-list-sync', (event, fullPath) => {
    if (!isAllowedFsPathOrRefresh(fullPath))
      return deny(event, 'chevron:fs-list-sync', fullPath);
    try {
      const names = fs.readdirSync(fullPath);
      ok(event, names.map(name => path.join(fullPath, name)));
    } catch (error) {
      fail(event, error);
    }
  });

  // --- mutations ------------------------------------------------------------

  ipcMain.on('chevron:fs-mkdirp-sync', (event, fullPath) => {
    if (!isAllowedFsPath(fullPath))
      return deny(event, 'chevron:fs-mkdirp-sync', fullPath);
    try {
      fs.mkdirSync(fullPath, { recursive: true });
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('chevron:fs-write-file-sync', (event, fullPath, data, encoding) => {
    if (!isAllowedFsPath(fullPath))
      return deny(event, 'chevron:fs-write-file-sync', fullPath);
    const payload = validateWriteFilePayload(data, encoding);
    if (!payload.ok) {
      console.warn(`atom-fs-write-file-sync: refused (${payload.reason})`);
      event.returnValue = { ok: false, error: payload.reason, code: 'EINVAL' };
      return;
    }
    try {
      if (encoding) fs.writeFileSync(fullPath, data, encoding);
      else fs.writeFileSync(fullPath, data);
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('chevron:fs-read-file-sync', (event, fullPath, encoding) => {
    if (!isAllowedFsPath(fullPath))
      return deny(event, 'chevron:fs-read-file-sync', fullPath);
    try {
      const st = fs.statSync(fullPath);
      if (st.size > READ_FILE_MAX_BYTES) {
        fail(event, Object.assign(new Error('file too large'), { code: 'EFBIG' }));
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

  ipcMain.on('chevron:fs-copy-sync', (event, src, dest) => {
    if (!isAllowedFsPath(src) || !isAllowedFsPath(dest)) {
      return deny(event, 'chevron:fs-copy-sync', `${src} -> ${dest}`);
    }
    try {
      copyPathSync(src, dest);
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('chevron:fs-move-sync', (event, src, dest) => {
    if (!isAllowedFsPath(src) || !isAllowedFsPath(dest)) {
      return deny(event, 'chevron:fs-move-sync', `${src} -> ${dest}`);
    }
    try {
      fs.renameSync(src, dest);
      ok(event, true);
    } catch (error) {
      try {
        copyPathSync(src, dest);
        fs.rmSync(src, { recursive: true, force: true });
        ok(event, true);
      } catch (error2) {
        fail(event, error2);
      }
    }
  });

  ipcMain.on('chevron:fs-rename-sync', (event, src, dest) => {
    if (!isAllowedFsPath(src) || !isAllowedFsPath(dest)) {
      return deny(event, 'chevron:fs-rename-sync', `${src} -> ${dest}`);
    }
    try {
      fs.renameSync(src, dest);
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });

  ipcMain.on('chevron:fs-rmdir-sync', (event, fullPath) => {
    if (!isAllowedFsPath(fullPath))
      return deny(event, 'chevron:fs-rmdir-sync', fullPath);
    try {
      fs.rmdirSync(fullPath);
      ok(event, true);
    } catch (error) {
      fail(event, error);
    }
  });
};

module.exports.setFsIpcPolicy = setFsIpcPolicy;
module.exports.refreshFsIpcRoots = refreshFsIpcRoots;
module.exports.isAllowedFsPath = isAllowedFsPath;
module.exports.isAllowedFsPathOrRefresh = isAllowedFsPathOrRefresh;
module.exports.applyProjectRootsFromRenderer = applyProjectRootsFromRenderer;
module.exports.validateProjectRoots = validateProjectRoots;
module.exports.validateWriteFilePayload = validateWriteFilePayload;
