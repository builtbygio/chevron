'use strict';

/**
 * IPC used by the renderer without electron.remote / @electron/remote.
 * Registered once from AtomApplication so handlers can resolve AtomWindow.
 */

const fs = require('fs');
const path = require('path');
const {
  BrowserWindow,
  Menu,
  clipboard,
  dialog,
  ipcMain: electronIpcMain,
  nativeTheme,
  screen,
  shell,
  app,
  systemPreferences,
  webContents
} = require('electron');
const guard = require('./ipc-guard');
const { isSafeAbsolutePath } = guard;
const { isAllowedFsPath } = require('./register-fs-ipc');
const { isMainOnlyChannel } = require('./main-to-renderer-channels');
const { withLegacyAliases } = require('./ipc-aliases');

let registered = false;

// Phase N2.1: settings-view avatar cache lives only under userData/Cache/settings-view.
const SETTINGS_VIEW_CACHE_MAX_BYTES = 5 * 1024 * 1024;
const SAFE_CACHE_BASENAME = /^[A-Za-z0-9._-]+$/;

function browserWindowFromEvent(event) {
  const owner = guard.requireOwnerWindow(event, { BrowserWindow });
  return owner.ok ? owner.window : null;
}

// Methods remote-compat may invoke on utilityProcess git workers only.
const PACKAGE_WORKER_WINDOW_METHODS = new Set([
  'loadURL',
  'destroy',
  'isDestroyed'
]);

// Schemes the renderer is allowed to hand to shell.openExternal. The main
// process is the real trust boundary here: the renderer-side link handler
// only ever passes http(s), but a compromised renderer could otherwise ask
// the OS to open file://, smb://, or an arbitrary app-registered scheme.
const OPEN_EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

function isAllowedExternalUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    return OPEN_EXTERNAL_SCHEMES.has(new URL(url).protocol);
  } catch (error) {
    return false;
  }
}

// Absolute filesystem paths only for shell FS helpers. Rejects relative paths
// and null bytes so a compromised renderer cannot coerce odd shell targets.
/**
 * What lsp:start-server will accept. The command itself is checked by
 * lsp-command-policy; this is the shape around it, including the environment
 * and working directory the server would be spawned with.
 */
function validateStartServerOptions(opts) {
  const root = guard.requireAbsolutePath(opts && opts.projectRoot, {
    name: 'projectRoot'
  });
  if (!root.ok) return root;

  for (const [name, value] of [
    ['serverId', opts.serverId],
    ['command', opts.command]
  ]) {
    const check = guard.requireString(value, { name });
    if (!check.ok) return check;
  }

  const args = guard.requireStringArray(opts.args, { name: 'args' });
  if (!args.ok) return args;

  if (opts.rootUri !== undefined) {
    const uri = guard.requireString(opts.rootUri, { name: 'rootUri' });
    if (!uri.ok) return uri;
  }

  if (opts.cwd !== undefined) {
    // A server that can start anywhere makes the project root meaningless.
    const cwd = guard.requireAbsolutePath(opts.cwd, {
      name: 'cwd',
      roots: [opts.projectRoot]
    });
    if (!cwd.ok) return cwd;
  }

  if (opts.env !== undefined) {
    if (!opts.env || typeof opts.env !== 'object' || Array.isArray(opts.env)) {
      return { ok: false, reason: 'env must be an object' };
    }
    for (const key of Object.keys(opts.env)) {
      const check = guard.requireString(opts.env[key], {
        name: `env.${key}`,
        allowEmpty: true
      });
      if (!check.ok) return check;
    }
  }

  return { ok: true };
}

/**
 * A renderer may not send on a channel main sends on. The receiving window
 * cannot tell the two apart, so allowing it lets one package impersonate main
 * to another window — or to its own.
 */
/** Text and shape a dialog may be given. Electron throws on the rest. */
const DIALOG_STRING_FIELDS = ['title', 'message', 'detail', 'checkboxLabel', 'defaultPath', 'buttonLabel'];

function validateDialogOptions(options) {
  if (options === undefined || options === null) return { ok: true };
  if (typeof options !== 'object' || Array.isArray(options)) {
    return { ok: false, reason: 'options must be an object' };
  }
  for (const field of DIALOG_STRING_FIELDS) {
    if (options[field] === undefined) continue;
    const check = guard.requireString(options[field], {
      name: field,
      allowEmpty: true
    });
    if (!check.ok) return check;
  }
  if (options.buttons !== undefined) {
    const check = guard.requireStringArray(options.buttons, { name: 'buttons' });
    if (!check.ok) return check;
  }
  for (const field of ['defaultId', 'cancelId']) {
    if (options[field] === undefined) continue;
    const check = guard.requireInt(options[field], { name: field, min: 0 });
    if (!check.ok) return check;
  }
  return { ok: true };
}

/** A menu template, one level of submenus, with only strings for display. */
function validateMenuTemplate(template, depth = 0) {
  if (template === undefined || template === null) return { ok: true };
  if (!Array.isArray(template)) {
    return { ok: false, reason: 'menu template must be an array' };
  }
  if (depth > 8) return { ok: false, reason: 'menu template nested too deeply' };
  for (const item of template) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, reason: 'each menu item must be an object' };
    }
    for (const field of ['label', 'type', 'role', 'id', 'accelerator']) {
      if (item[field] === undefined) continue;
      const check = guard.requireString(item[field], {
        name: `menu item ${field}`,
        allowEmpty: true
      });
      if (!check.ok) return check;
    }
    if (item.submenu !== undefined) {
      const check = validateMenuTemplate(item.submenu, depth + 1);
      if (!check.ok) return check;
    }
  }
  return { ok: true };
}

/**
 * A renderer may not send on a channel main sends on. The receiving window
 * cannot tell the two apart, so allowing it lets one package impersonate main
 * to another window — or to its own.
 */
function validateCrossWindowSend(windowId, channel) {
  const id = guard.requireInt(windowId, { name: 'window id', min: 0 });
  if (!id.ok) return id;
  const name = guard.requireString(channel, { name: 'channel' });
  if (!name.ok) return name;
  if (isMainOnlyChannel(channel)) {
    return { ok: false, reason: `${channel} is a main-process channel` };
  }
  return { ok: true };
}

/**
 * The shape of a call against a running language server session.
 *
 * This checks the payload, not who is asking. Sessions are keyed by
 * `${registrationId}:${projectRoot}`, which is deliberately the same in every
 * window that has the project open, so a single owner cannot be enforced
 * without breaking the shared case — and stop-server would need refcounting
 * before it could be. See docs/reference/security-threat-model.md.
 */
function validateLspSessionCall(serverId, method, timeoutMs) {
  const id = guard.requireString(serverId, { name: 'serverId' });
  if (!id.ok) return id;
  if (method !== undefined) {
    const m = guard.requireString(method, { name: 'method' });
    if (!m.ok) return m;
  }
  if (timeoutMs !== undefined) {
    const t = guard.requireInt(timeoutMs, { name: 'timeoutMs', min: 1, max: 600000 });
    if (!t.ok) return t;
  }
  return { ok: true };
}

// The names Electron's app.getPath accepts. Anything else throws inside it.
const APP_PATH_NAMES = new Set([
  'home', 'appData', 'userData', 'sessionData', 'temp', 'exe', 'module',
  'desktop', 'documents', 'downloads', 'music', 'pictures', 'videos',
  'recent', 'logs', 'crashDumps'
]);

const CLIPBOARD_TYPES = new Set(['selection', 'clipboard']);

function isClipboardType(type) {
  if (type === undefined || type === null || type === '') return true;
  return typeof type === 'string' && CLIPBOARD_TYPES.has(type);
}

/** systemPreferences.getUserDefault takes a key and a known value type. */
const USER_DEFAULT_TYPES = new Set([
  'string', 'boolean', 'integer', 'float', 'double', 'url', 'array', 'dictionary'
]);

function isUserDefaultQuery(key, type) {
  if (!guard.requireString(key, { name: 'key' }).ok) return false;
  return typeof type === 'string' && USER_DEFAULT_TYPES.has(type);
}

const REGISTRABLE_PROTOCOLS = new Set(['chevron', 'atom']);

/** Only this app's schemes, and only this app's binary. */
function protocolRegistration(protocol, args) {
  if (!REGISTRABLE_PROTOCOLS.has(protocol)) return null;
  const check = guard.requireStringArray(args, { name: 'args' });
  if (!check.ok) return null;
  return { protocol, execPath: process.execPath, args: args || [] };
}

/**
 * A jump list task names a program the OS will launch later, so the only
 * program accepted is this application's own.
 */
function validateJumpList(categories) {
  if (!Array.isArray(categories)) {
    return { ok: false, reason: 'categories must be an array' };
  }
  for (const category of categories) {
    if (!category || typeof category !== 'object') {
      return { ok: false, reason: 'each category must be an object' };
    }
    if (category.items === undefined) continue;
    if (!Array.isArray(category.items)) {
      return { ok: false, reason: 'category items must be an array' };
    }
    for (const item of category.items) {
      if (!item || typeof item !== 'object') {
        return { ok: false, reason: 'each item must be an object' };
      }
      if (item.program !== undefined && item.program !== process.execPath) {
        return {
          ok: false,
          reason: `item program must be this application (${String(item.program)})`
        };
      }
      for (const field of ['title', 'description', 'args', 'iconPath']) {
        if (item[field] === undefined) continue;
        const check = guard.requireString(item[field], {
          name: `item ${field}`,
          allowEmpty: true
        });
        if (!check.ok) return check;
      }
    }
  }
  return { ok: true };
}

function nativeThemeSnapshot() {
  return {
    shouldUseDarkColors: !!nativeTheme.shouldUseDarkColors,
    shouldUseHighContrastColors: !!nativeTheme.shouldUseHighContrastColors,
    themeSource: nativeTheme.themeSource
  };
}

function settingsViewCacheRoot() {
  return path.join(app.getPath('userData'), 'Cache', 'settings-view');
}

function isSafeCacheBasename(name) {
  return typeof name === 'string' && SAFE_CACHE_BASENAME.test(name);
}

function resolveSettingsViewCachePath(basename) {
  if (!isSafeCacheBasename(basename)) return null;
  const root = path.resolve(settingsViewCacheRoot());
  const resolved = path.resolve(root, basename);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

module.exports = function registerRendererIpc(atomApplication) {
  // Every registration below also answers to the name it had; see ipc-aliases.
  const ipcMain = withLegacyAliases(electronIpcMain);
  if (registered) return;
  registered = true;

  // Phase N2.2–N2.3 + P2.1 filesystem bridge (absolute paths + optional strict roots).
  require('./register-fs-ipc')(atomApplication);

  // H1 PR 2b — ripgrep spawn lives in main, not the preload searcher.
  require('./register-rg-ipc')(atomApplication);

  // Terminals. The pty host does the spawning; the renderer only asks.
  require('./register-pty-ipc')(atomApplication);

  // Phase S3 / PR 9 — github git workers via utilityProcess only.
  const packageUtilityWorker = require('./package-utility-worker');

  // --- Boot / load settings (P0) ---------------------------------------------

  ipcMain.on('chevron:window-load-settings-sync', event => {
    const win = browserWindowFromEvent(event);
    try {
      event.returnValue =
        win && typeof win.loadSettingsJSON === 'string'
          ? win.loadSettingsJSON
          : '{}';
    } catch (error) {
      console.error(error);
      event.returnValue = '{}';
    }
  });

  ipcMain.on('chevron:window-startup-markers-sync', event => {
    const win = browserWindowFromEvent(event);
    try {
      // One-shot getter on BrowserWindow (see atom-window.js)
      event.returnValue = win ? win.startupMarkers : null;
    } catch (error) {
      console.error(error);
      event.returnValue = null;
    }
  });

  // --- BrowserWindow method proxy (P0/P1) -----------------------------------

  const ALLOWED_WINDOW_METHODS = new Set([
    'getSize',
    'getPosition',
    'isMaximized',
    'isFullScreen',
    'isFocused',
    'isMinimized',
    'isVisible',
    'isWebViewFocused',
    'setSize',
    'setPosition',
    'center',
    'show',
    'hide',
    'focus',
    'minimize',
    'maximize',
    'unmaximize',
    'restore',
    'close',
    'openDevTools',
    'closeDevTools',
    'toggleDevTools',
    'setFullScreen',
    'setMenuBarVisibility',
    'setAutoHideMenuBar',
    'setDocumentEdited',
    'setRepresentedFilename',
    'setSheetOffset',
    'setTitle'
  ]);

  // Methods that historically lived on BrowserWindow but moved to webContents
  // (or were removed) in modern Electron. Keep the IPC surface stable for the
  // renderer proxy in renderer-ipc.js.
  const WEB_CONTENTS_FALLBACK_METHODS = new Set([
    'openDevTools',
    'closeDevTools',
    'toggleDevTools'
  ]);

  ipcMain.on('chevron:browser-window-call-sync', (event, method, ...args) => {
    const win = browserWindowFromEvent(event);
    if (!win || !ALLOWED_WINDOW_METHODS.has(method)) {
      event.returnValue = null;
      return;
    }
    try {
      let result;
      if (method === 'isWebViewFocused') {
        // BrowserWindow.isWebViewFocused() was removed; page focus is webContents.
        const wc = win.webContents;
        result = !!(
          wc &&
          !wc.isDestroyed() &&
          typeof wc.isFocused === 'function' &&
          wc.isFocused()
        );
      } else if (typeof win[method] === 'function') {
        result = win[method](...args);
      } else if (
        WEB_CONTENTS_FALLBACK_METHODS.has(method) &&
        win.webContents &&
        typeof win.webContents[method] === 'function'
      ) {
        result = win.webContents[method](...args);
      } else {
        event.returnValue = null;
        return;
      }
      // Avoid returning non-cloneable objects over IPC
      event.returnValue = result === win ? true : result;
    } catch (error) {
      console.error(`atom-browser-window-call-sync ${method}:`, error);
      event.returnValue = null;
    }
  });

  ipcMain.on('chevron:web-contents-call-sync', (event, method, ...args) => {
    // Clipboard/history editing only. executeJavaScript was previously
    // reachable here but has no consumer (getCurrentWebContents is used only
    // for its .id), so it is intentionally excluded — the renderer must not
    // be able to eval arbitrary code in a webContents over IPC.
    const ALLOWED = new Set([
      'copy',
      'paste',
      'cut',
      'undo',
      'redo',
      'selectAll'
    ]);
    if (!ALLOWED.has(method)) {
      event.returnValue = null;
      return;
    }
    try {
      event.returnValue = event.sender[method](...args);
    } catch (error) {
      console.error(`atom-web-contents-call-sync ${method}:`, error);
      event.returnValue = null;
    }
  });

  // Context menu: renderer sends template; main shows it (was window.emit via remote)
  ipcMain.on('chevron:context-menu', (event, menuTemplate) => {
    const check = validateMenuTemplate(menuTemplate);
    if (!check.ok) {
      console.warn(`atom-context-menu refused: ${check.reason}`);
      return;
    }
    const win = browserWindowFromEvent(event);
    if (win) win.emit('context-menu', menuTemplate);
  });

  // --- Dialogs (P1) ---------------------------------------------------------

  ipcMain.handle('chevron:show-message-box', async (event, options) => {
    const check = validateDialogOptions(options);
    if (!check.ok) {
      console.warn(`atom-show-message-box refused: ${check.reason}`);
      return null;
    }
    const win = browserWindowFromEvent(event);
    return dialog.showMessageBox(win || undefined, options);
  });

  ipcMain.on('chevron:show-message-box-sync', (event, options) => {
    const check = validateDialogOptions(options);
    if (!check.ok) {
      console.warn(`atom-show-message-box-sync refused: ${check.reason}`);
      event.returnValue = 0;
      return;
    }
    const win = browserWindowFromEvent(event);
    try {
      event.returnValue = dialog.showMessageBoxSync(win || undefined, options);
    } catch (error) {
      console.error(error);
      event.returnValue = 0;
    }
  });

  ipcMain.handle('chevron:show-save-dialog', async (event, options) => {
    const check = validateDialogOptions(options);
    if (!check.ok) {
      console.warn(`atom-show-save-dialog refused: ${check.reason}`);
      return null;
    }
    const win = browserWindowFromEvent(event);
    const atomWindow = atomApplication.atomWindowForBrowserWindow(win);
    if (atomWindow && typeof atomWindow.showSaveDialog === 'function') {
      return atomWindow.showSaveDialog(options || {});
    }
    return dialog.showSaveDialog(win || undefined, options || {});
  });

  // --- Screen / systemPreferences / shell / app (P1/P2) ---------------------

  // Read-only view of Electron's nativeTheme, for core.followSystemTheme.
  // Changes are pushed on chevron:did-change-native-theme (atom-application).
  ipcMain.on('chevron:native-theme-sync', event => {
    event.returnValue = nativeThemeSnapshot();
  });

  ipcMain.handle('chevron:native-theme', () => nativeThemeSnapshot());

  ipcMain.on('chevron:get-primary-display-work-area-size-sync', event => {
    try {
      event.returnValue = screen.getPrimaryDisplay().workAreaSize;
    } catch (error) {
      event.returnValue = { width: 0, height: 0 };
    }
  });

  ipcMain.handle('chevron:get-primary-display-work-area-size', () => {
    try {
      return screen.getPrimaryDisplay().workAreaSize;
    } catch (error) {
      return { width: 0, height: 0 };
    }
  });

  ipcMain.on('chevron:get-user-default-sync', (event, key, type) => {
    if (!isUserDefaultQuery(key, type)) {
      event.returnValue = undefined;
      return;
    }
    try {
      if (process.platform === 'darwin' && systemPreferences) {
        event.returnValue = systemPreferences.getUserDefault(key, type);
      } else {
        event.returnValue = undefined;
      }
    } catch (error) {
      event.returnValue = undefined;
    }
  });

  ipcMain.handle('chevron:get-user-default', (_event, key, type) => {
    if (!isUserDefaultQuery(key, type)) return undefined;
    try {
      if (process.platform === 'darwin' && systemPreferences) {
        return systemPreferences.getUserDefault(key, type);
      }
      return undefined;
    } catch (error) {
      return undefined;
    }
  });

  ipcMain.handle('chevron:shell-open-external', async (_event, url) => {
    if (!isAllowedExternalUrl(url)) {
      console.warn(`atom-shell-open-external: blocked url ${String(url)}`);
      return false;
    }
    return shell.openExternal(url);
  });

  // Reveal a path in the OS file manager (tree-view "Show in Finder", etc.).
  ipcMain.handle('chevron:shell-show-item-in-folder', async (_event, fullPath) => {
    // Confined like a read: revealing a path also confirms it exists.
    if (!isAllowedFsPath(fullPath)) {
      console.warn(
        `atom-shell-show-item-in-folder: blocked path ${String(fullPath)}`
      );
      return false;
    }
    try {
      shell.showItemInFolder(fullPath);
      return true;
    } catch (error) {
      console.error('chevron:shell-show-item-in-folder', error);
      return false;
    }
  });

  // Move a path to the trash. Electron removed sync moveItemToTrash; use
  // async trashItem. Returns boolean success for package call sites.
  ipcMain.handle('chevron:shell-move-item-to-trash', async (_event, fullPath) => {
    // Confined to the same roots as a write. Absolute-and-nul-free let any
    // package trash any file, while atom-fs-write-file-sync beside it could
    // not touch one outside a project.
    if (!isAllowedFsPath(fullPath)) {
      console.warn(
        `atom-shell-move-item-to-trash: blocked path ${String(fullPath)}`
      );
      return false;
    }
    try {
      await shell.trashItem(fullPath);
      return true;
    } catch (error) {
      console.error('chevron:shell-move-item-to-trash', error);
      return false;
    }
  });

  // --- Phase N2.1: settings-view avatar cache (confined FS) -----------------
  // Renderer packages must not write arbitrary paths; only basenames under
  // userData/Cache/settings-view are accepted.

  ipcMain.handle('chevron:settings-view-cache-ensure', async () => {
    const root = settingsViewCacheRoot();
    try {
      fs.mkdirSync(root, { recursive: true });
      return root;
    } catch (error) {
      console.error('chevron:settings-view-cache-ensure', error);
      return null;
    }
  });

  ipcMain.handle('chevron:settings-view-cache-list', async () => {
    const root = settingsViewCacheRoot();
    try {
      return fs
        .readdirSync(root)
        .filter(name => isSafeCacheBasename(name));
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      console.error('chevron:settings-view-cache-list', error);
      return [];
    }
  });

  ipcMain.handle(
    'chevron:settings-view-cache-write',
    async (_event, basename, data) => {
      const abs = resolveSettingsViewCachePath(basename);
      if (!abs) {
        console.warn(
          `atom-settings-view-cache-write: blocked name ${String(basename)}`
        );
        return { ok: false, error: 'invalid-name' };
      }
      try {
        const buf = Buffer.isBuffer(data)
          ? data
          : Buffer.from(data || []);
        if (buf.length > SETTINGS_VIEW_CACHE_MAX_BYTES) {
          return { ok: false, error: 'too-large' };
        }
        fs.mkdirSync(settingsViewCacheRoot(), { recursive: true });
        fs.writeFileSync(abs, buf);
        return { ok: true, path: abs };
      } catch (error) {
        console.error('chevron:settings-view-cache-write', error);
        return { ok: false, error: String(error && error.message) };
      }
    }
  );

  ipcMain.handle('chevron:settings-view-cache-unlink', async (_event, basename) => {
    const abs = resolveSettingsViewCachePath(basename);
    if (!abs) {
      console.warn(
        `atom-settings-view-cache-unlink: blocked name ${String(basename)}`
      );
      return false;
    }
    try {
      fs.unlinkSync(abs);
      return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') return true;
      console.error('chevron:settings-view-cache-unlink', error);
      return false;
    }
  });

  // Path probes / bulk FS: see register-fs-ipc.js (N2.2–N2.3).

  ipcMain.on('chevron:shell-beep-sync', event => {
    shell.beep();
    event.returnValue = true;
  });

  ipcMain.handle('chevron:shell-beep', () => {
    shell.beep();
    return true;
  });

  // app.getPath only knows a fixed set of names; anything else throws.
  ipcMain.on('chevron:app-get-path-sync', (event, name) => {
    if (!APP_PATH_NAMES.has(name)) {
      console.warn(`atom-app-get-path-sync: refused name ${String(name)}`);
      event.returnValue = null;
      return;
    }
    try {
      event.returnValue = app.getPath(name);
    } catch (error) {
      event.returnValue = null;
    }
  });

  ipcMain.on('chevron:app-get-version-sync', event => {
    event.returnValue = app.getVersion();
  });

  // Windows jump list (reopen-project-menu-manager)
  ipcMain.on('chevron:app-get-jump-list-settings-sync', event => {
    try {
      event.returnValue =
        typeof app.getJumpListSettings === 'function'
          ? app.getJumpListSettings()
          : { removedItems: [] };
    } catch (error) {
      event.returnValue = { removedItems: [] };
    }
  });

  ipcMain.on('chevron:app-set-jump-list-sync', (event, categories) => {
    const check = validateJumpList(categories);
    if (!check.ok) {
      console.warn(`atom-app-set-jump-list-sync refused: ${check.reason}`);
      event.returnValue = false;
      return;
    }
    try {
      if (typeof app.setJumpList === 'function') {
        app.setJumpList(categories);
      }
      event.returnValue = true;
    } catch (error) {
      console.error(error);
      event.returnValue = false;
    }
  });

  ipcMain.handle('chevron:app-get-jump-list-settings', () => {
    try {
      return typeof app.getJumpListSettings === 'function'
        ? app.getJumpListSettings()
        : { removedItems: [] };
    } catch (error) {
      return { removedItems: [] };
    }
  });

  ipcMain.handle('chevron:app-set-jump-list', (_event, categories) => {
    const check = validateJumpList(categories);
    if (!check.ok) {
      console.warn(`chevron:app-set-jump-list refused: ${check.reason}`);
      return false;
    }
    try {
      if (typeof app.setJumpList === 'function') {
        app.setJumpList(categories);
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  });

  // --- Clipboard (P2) -------------------------------------------------------

  ipcMain.on('chevron:clipboard-write-text-sync', (event, text, type) => {
    if (!guard.requireString(text, { name: 'text', allowEmpty: true }).ok ||
        !isClipboardType(type)) {
      event.returnValue = false;
      return;
    }
    try {
      if (type) clipboard.writeText(text, type);
      else clipboard.writeText(text);
      event.returnValue = true;
    } catch (error) {
      event.returnValue = false;
    }
  });

  ipcMain.on('chevron:clipboard-read-text-sync', (event, type) => {
    if (!isClipboardType(type)) {
      event.returnValue = '';
      return;
    }
    try {
      event.returnValue = type ? clipboard.readText(type) : clipboard.readText();
    } catch (error) {
      event.returnValue = '';
    }
  });

  ipcMain.on('chevron:clipboard-write-find-text-sync', (event, text) => {
    if (!guard.requireString(text, { name: 'text', allowEmpty: true }).ok) {
      event.returnValue = false;
      return;
    }
    try {
      if (typeof clipboard.writeFindText === 'function') {
        clipboard.writeFindText(text);
      }
      event.returnValue = true;
    } catch (error) {
      event.returnValue = false;
    }
  });

  ipcMain.on('chevron:clipboard-read-find-text-sync', event => {
    try {
      event.returnValue =
        typeof clipboard.readFindText === 'function'
          ? clipboard.readFindText()
          : '';
    } catch (error) {
      event.returnValue = '';
    }
  });

  // Cross-window webContents.send by BrowserWindow id (tabs / tree-view DND)
  ipcMain.on(
    'chevron:webcontents-send-to-window-id',
    (event, windowId, channel, ...args) => {
      const check = validateCrossWindowSend(windowId, channel);
      if (!check.ok) {
        console.warn(
          `atom-webcontents-send-to-window-id: refused (${check.reason})`
        );
        return;
      }
      try {
        const win = BrowserWindow.fromId(windowId);
        if (win && !win.isDestroyed()) {
          win.webContents.send(channel, ...args);
        }
      } catch (error) {
        console.error(error);
      }
    }
  );

  ipcMain.on('chevron:get-current-window-id-sync', event => {
    const win = browserWindowFromEvent(event);
    event.returnValue = win ? win.id : -1;
  });

  // Protocol client (settings-view); also available via ipcMain.handle elsewhere
  ipcMain.on(
    'chevron:is-default-protocol-client-sync',
    (event, protocolName, _execPath, args) => {
      const reg = protocolRegistration(protocolName, args);
      if (!reg) {
        event.returnValue = false;
        return;
      }
      try {
        event.returnValue = app.isDefaultProtocolClient(
          reg.protocol,
          reg.execPath,
          reg.args
        );
      } catch (error) {
        event.returnValue = false;
      }
    }
  );

  ipcMain.on(
    'chevron:set-as-default-protocol-client-sync',
    (event, protocolName, _execPath, args) => {
      const reg = protocolRegistration(protocolName, args);
      if (!reg) {
        event.returnValue = false;
        return;
      }
      try {
        event.returnValue = app.setAsDefaultProtocolClient(
          reg.protocol,
          reg.execPath,
          reg.args
        );
      } catch (error) {
        event.returnValue = false;
      }
    }
  );

  // --- WebContents id / send (github workers, sendTo) ------------------------

  ipcMain.on('chevron:get-web-contents-id-sync', event => {
    event.returnValue = event.sender.id;
  });

  // Allow main→renderer channel used by utility workers (same as BW workers).
  // (No change to allowlist logic below; utility workers never call atom-wc-send.)

  ipcMain.on('chevron:wc-send', (event, webContentsId, channel, ...args) => {
    // Git workers use atom-utility-worker-send. This channel is send-to-self only.
    const nameCheck = validateCrossWindowSend(webContentsId, channel);
    if (!nameCheck.ok) {
      console.warn(`atom-wc-send: refused (${nameCheck.reason})`);
      return;
    }
    try {
      const senderId = event.sender.id;
      const targetId = webContentsId;
      const allowed = senderId === targetId;

      if (!allowed) {
        console.warn(
          `atom-wc-send: blocked channel=${String(channel)} from=${senderId} to=${targetId}`
        );
        return;
      }

      const wc = webContents.fromId(webContentsId);
      if (wc && !wc.isDestroyed()) {
        wc.send(channel, ...args);
      }
    } catch (error) {
      console.error(error);
    }
  });

  ipcMain.on('chevron:wc-is-destroyed-sync', (event, webContentsId) => {
    try {
      if (webContentsId !== event.sender.id) {
        event.returnValue = true;
        return;
      }
      const wc = webContents.fromId(webContentsId);
      event.returnValue = !wc || wc.isDestroyed();
    } catch (error) {
      event.returnValue = true;
    }
  });

  // --- utilityProcess workers (Phase S3 / #61) ------------------------------

  ipcMain.on('chevron:utility-worker-enabled-sync', event => {
    event.returnValue = packageUtilityWorker.isEnabled();
  });

  ipcMain.handle('chevron:utility-worker-capabilities', () => {
    return {
      utilityProcess: true,
      githubUtilityWorkers: packageUtilityWorker.isEnabled()
    };
  });

  ipcMain.on('chevron:utility-worker-create-sync', event => {
    try {
      if (!packageUtilityWorker.isEnabled()) {
        event.returnValue = null;
        return;
      }
      const created = packageUtilityWorker.createWorker(event.sender);
      event.returnValue = created;
    } catch (error) {
      console.error('chevron:utility-worker-create-sync', error);
      event.returnValue = null;
    }
  });

  ipcMain.on('chevron:utility-worker-load-sync', (event, workerId, loadUrl) => {
    try {
      const meta = packageUtilityWorker.getWorker(workerId);
      if (!meta || meta.managerWcId !== event.sender.id) {
        event.returnValue = false;
        return;
      }
      event.returnValue = packageUtilityWorker.loadWorkerUrl(workerId, loadUrl);
    } catch (error) {
      console.error('chevron:utility-worker-load-sync', error);
      event.returnValue = false;
    }
  });

  ipcMain.on(
    'chevron:utility-worker-send',
    (event, workerId, _channel, payload) => {
      try {
        const meta = packageUtilityWorker.getWorker(workerId);
        if (!meta || meta.managerWcId !== event.sender.id) return;
        packageUtilityWorker.sendToWorker(workerId, _channel, payload);
      } catch (error) {
        console.error('chevron:utility-worker-send', error);
      }
    }
  );

  ipcMain.on('chevron:utility-worker-destroy-sync', (event, workerId) => {
    try {
      const meta = packageUtilityWorker.getWorker(workerId);
      if (!meta || meta.managerWcId !== event.sender.id) {
        event.returnValue = false;
        return;
      }
      event.returnValue = packageUtilityWorker.destroy(workerId);
    } catch (error) {
      console.error('chevron:utility-worker-destroy-sync', error);
      event.returnValue = false;
    }
  });

  ipcMain.on('chevron:utility-worker-is-destroyed-sync', (event, workerId) => {
    if (!guard.requireInt(workerId, { name: 'workerId', min: 0 }).ok) {
      event.returnValue = true;
      return;
    }
    event.returnValue = !packageUtilityWorker.isUtilityWorker(workerId);
  });

  // Node BrowserWindow git workers are gone (PR 9). Always refuse.
  ipcMain.on('chevron:create-browser-window-sync', event => {
    console.warn(
      'atom-create-browser-window-sync: refused — git workers use utilityProcess only'
    );
    event.returnValue = null;
  });

  ipcMain.on('chevron:bw-id-call-sync', (event, windowId, method, ...args) => {
    // P0.2: package-worker windows only + method allowlist (no BrowserWindow.fromId).
    if (!PACKAGE_WORKER_WINDOW_METHODS.has(method)) {
      console.warn(
        `atom-bw-id-call-sync: blocked method ${String(method)} on window ${windowId}`
      );
      event.returnValue = null;
      return;
    }

    // Phase S3: synthetic utility workers share the same call surface.
    if (packageUtilityWorker.isUtilityWorker(windowId)) {
      const uMeta = packageUtilityWorker.getWorker(windowId);
      if (!uMeta || uMeta.managerWcId !== event.sender.id) {
        event.returnValue =
          method === 'isDestroyed' ? true : method === 'destroy' ? true : null;
        return;
      }
      if (method === 'isDestroyed') {
        event.returnValue = false;
        return;
      }
      if (method === 'destroy') {
        event.returnValue = packageUtilityWorker.destroy(windowId);
        return;
      }
      if (method === 'loadURL') {
        event.returnValue = packageUtilityWorker.loadWorkerUrl(
          windowId,
          args[0]
        );
        return;
      }
      event.returnValue = null;
      return;
    }

    event.returnValue =
      method === 'isDestroyed' ? true : method === 'destroy' ? true : null;
  });

  ipcMain.on('chevron:destroy-own-window-sync', event => {
    const win = browserWindowFromEvent(event);
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
    event.returnValue = true;
  });

  // --- Popup menu with click callbacks (github) -----------------------------

  ipcMain.on('chevron:popup-menu', (event, sessionId, template) => {
    const check = validateMenuTemplate(template);
    if (!check.ok) {
      console.warn(`atom-popup-menu refused: ${check.reason}`);
      return;
    }
    const win = browserWindowFromEvent(event);
    try {
      const menu = Menu.buildFromTemplate(
        (template || []).map(item => {
          if (item.type === 'separator') {
            return { type: 'separator' };
          }
          return {
            label: item.label,
            type: item.type,
            enabled: item.enabled !== false,
            checked: item.checked,
            click: () => {
              if (!event.sender.isDestroyed()) {
                event.sender.send(
                  'atom-popup-menu-click',
                  sessionId,
                  item.id
                );
              }
            }
          };
        })
      );
      menu.popup({ window: win || undefined });
    } catch (error) {
      console.error('chevron:popup-menu', error);
    }
  });

  // --- Open dialog (github DirectorySelect) ---------------------------------

  ipcMain.handle('chevron:show-open-dialog', async (event, options) => {
    const check = validateDialogOptions(options);
    if (!check.ok) {
      console.warn(`atom-show-open-dialog refused: ${check.reason}`);
      return null;
    }
    const win = browserWindowFromEvent(event);
    return dialog.showOpenDialog(win || undefined, options || {});
  });

  // --- LSP host (Phase 1) ---------------------------------------------------
  const lspManager = require('./lsp-worker-manager');

  ipcMain.handle('lsp:subscribe', event => {
    lspManager.subscribe(event.sender);
    return { ok: true };
  });

  ipcMain.handle('lsp:unsubscribe', event => {
    lspManager.unsubscribe(event.sender);
    return { ok: true };
  });

  ipcMain.handle('lsp:is-trusted', async (_event, { projectRoot } = {}) => {
    if (!guard.requireAbsolutePath(projectRoot, { name: 'projectRoot' }).ok) return false;
    return lspManager.isTrusted(projectRoot);
  });

  ipcMain.handle('lsp:get-trust-state', async (_event, { projectRoot } = {}) => {
    if (!guard.requireAbsolutePath(projectRoot, { name: 'projectRoot' }).ok) return null;
    return lspManager.getTrustState(projectRoot);
  });

  // Persist an in-editor trust decision. The Chevron modal (not a native
  // OS dialog) is the confirmation UI. start-server still refuses untrusted
  // roots. Revoking also records "declined" so we do not re-prompt.
  ipcMain.handle('lsp:set-trust', async (_event, { projectRoot, trusted } = {}) => {
    const root = guard.requireAbsolutePath(projectRoot, { name: 'projectRoot' });
    if (!root.ok) {
      console.warn(`lsp:set-trust refused: ${root.reason}`);
      return false;
    }
    lspManager.setTrusted(projectRoot, Boolean(trusted));
    return Boolean(trusted);
  });

  // Packages declare their servers at activation so main knows which
  // commands are legitimate; see lsp-command-policy.
  // The payload names a command; lsp-command-policy verifies an installed
  // package declares it before recording anything.
  ipcMain.handle('lsp:register-server', async (_event, { id, command } = {}) => {
    return lspManager.recordRegistration({ id, command });
  });

  ipcMain.handle('lsp:unregister-server', async (_event, { id } = {}) => {
    const check = guard.requireString(id, { name: 'id' });
    if (!check.ok) {
      console.warn(`lsp:unregister-server refused: ${check.reason}`);
      return false;
    }
    return lspManager.forgetRegistration(id);
  });

  ipcMain.handle('lsp:list-trusted', async () => {
    return lspManager.listTrusted();
  });

  ipcMain.handle('lsp:start-server', async (_event, opts = {}) => {
    const check = validateStartServerOptions(opts);
    if (!check.ok) {
      const error = new Error(`lsp:start-server refused: ${check.reason}`);
      error.code = 'LSP_PAYLOAD_REJECTED';
      throw error;
    }
    return lspManager.startServer(opts);
  });

  ipcMain.handle('lsp:request', async (_event, { serverId, method, params, timeoutMs } = {}) => {
    const check = validateLspSessionCall(serverId, method, timeoutMs);
    if (!check.ok) throw Object.assign(new Error(`lsp:request refused: ${check.reason}`), { code: 'LSP_PAYLOAD_REJECTED' });
    return lspManager.request(serverId, method, params, timeoutMs);
  });

  ipcMain.handle('lsp:notify', async (_event, { serverId, method, params } = {}) => {
    const check = validateLspSessionCall(serverId, method);
    if (!check.ok) {
      console.warn(`lsp:notify refused: ${check.reason}`);
      return false;
    }
    return lspManager.notify(serverId, method, params);
  });

  ipcMain.handle(
    'lsp:respond',
    async (_event, { serverId, id, result, error } = {}) => {
      const check = validateLspSessionCall(serverId);
      if (!check.ok) {
        console.warn(`lsp:respond refused: ${check.reason}`);
        return false;
      }
      return lspManager.respondToServer(serverId, id, result, error);
    }
  );

  ipcMain.handle('lsp:stop-server', async (_event, { serverId } = {}) => {
    const check = guard.requireString(serverId, { name: 'serverId' });
    if (!check.ok) {
      console.warn(`lsp:stop-server refused: ${check.reason}`);
      return false;
    }
    return lspManager.stopServer(serverId);
  });

  ipcMain.handle('lsp:list-servers', async () => {
    return lspManager.listServers();
  });

};

// Exported for script/ci/lsp-start-server-payload.test.js.
module.exports.validateStartServerOptions = validateStartServerOptions;
module.exports.validateJumpList = validateJumpList;
module.exports.validateCrossWindowSend = validateCrossWindowSend;
module.exports.validateDialogOptions = validateDialogOptions;
module.exports.validateMenuTemplate = validateMenuTemplate;
module.exports.validateLspSessionCall = validateLspSessionCall;
module.exports.isClipboardType = isClipboardType;
module.exports.isUserDefaultQuery = isUserDefaultQuery;
module.exports.APP_PATH_NAMES = APP_PATH_NAMES;
