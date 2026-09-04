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
  ipcMain,
  screen,
  shell,
  app,
  systemPreferences,
  webContents
} = require('electron');

let registered = false;

// Phase N2.1: settings-view avatar cache lives only under userData/Cache/settings-view.
const SETTINGS_VIEW_CACHE_MAX_BYTES = 5 * 1024 * 1024;
const SAFE_CACHE_BASENAME = /^[A-Za-z0-9._-]+$/;

function browserWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
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
function isSafeAbsolutePath(fullPath) {
  if (typeof fullPath !== 'string' || fullPath.length === 0) return false;
  if (fullPath.includes('\0')) return false;
  return path.isAbsolute(fullPath);
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

  ipcMain.on('atom-window-load-settings-sync', event => {
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

  ipcMain.on('atom-window-startup-markers-sync', event => {
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

  ipcMain.on('atom-browser-window-call-sync', (event, method, ...args) => {
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

  ipcMain.on('atom-web-contents-call-sync', (event, method, ...args) => {
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
  ipcMain.on('atom-context-menu', (event, menuTemplate) => {
    const win = browserWindowFromEvent(event);
    if (win) win.emit('context-menu', menuTemplate);
  });

  // --- Dialogs (P1) ---------------------------------------------------------

  ipcMain.handle('atom-show-message-box', async (event, options) => {
    const win = browserWindowFromEvent(event);
    return dialog.showMessageBox(win || undefined, options);
  });

  ipcMain.on('atom-show-message-box-sync', (event, options) => {
    const win = browserWindowFromEvent(event);
    try {
      event.returnValue = dialog.showMessageBoxSync(win || undefined, options);
    } catch (error) {
      console.error(error);
      event.returnValue = 0;
    }
  });

  ipcMain.handle('atom-show-save-dialog', async (event, options) => {
    const win = browserWindowFromEvent(event);
    const atomWindow = atomApplication.atomWindowForBrowserWindow(win);
    if (atomWindow && typeof atomWindow.showSaveDialog === 'function') {
      return atomWindow.showSaveDialog(options || {});
    }
    return dialog.showSaveDialog(win || undefined, options || {});
  });

  // --- Screen / systemPreferences / shell / app (P1/P2) ---------------------

  ipcMain.on('atom-get-primary-display-work-area-size-sync', event => {
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

  ipcMain.on('atom-get-user-default-sync', (event, key, type) => {
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
    try {
      if (process.platform === 'darwin' && systemPreferences) {
        return systemPreferences.getUserDefault(key, type);
      }
      return undefined;
    } catch (error) {
      return undefined;
    }
  });

  ipcMain.handle('atom-shell-open-external', async (_event, url) => {
    if (!isAllowedExternalUrl(url)) {
      console.warn(`atom-shell-open-external: blocked url ${String(url)}`);
      return false;
    }
    return shell.openExternal(url);
  });

  // Reveal a path in the OS file manager (tree-view "Show in Finder", etc.).
  ipcMain.handle('atom-shell-show-item-in-folder', async (_event, fullPath) => {
    if (!isSafeAbsolutePath(fullPath)) {
      console.warn(
        `atom-shell-show-item-in-folder: blocked path ${String(fullPath)}`
      );
      return false;
    }
    try {
      shell.showItemInFolder(fullPath);
      return true;
    } catch (error) {
      console.error('atom-shell-show-item-in-folder', error);
      return false;
    }
  });

  // Move a path to the trash. Electron removed sync moveItemToTrash; use
  // async trashItem. Returns boolean success for package call sites.
  ipcMain.handle('atom-shell-move-item-to-trash', async (_event, fullPath) => {
    if (!isSafeAbsolutePath(fullPath)) {
      console.warn(
        `atom-shell-move-item-to-trash: blocked path ${String(fullPath)}`
      );
      return false;
    }
    try {
      await shell.trashItem(fullPath);
      return true;
    } catch (error) {
      console.error('atom-shell-move-item-to-trash', error);
      return false;
    }
  });

  // --- Phase N2.1: settings-view avatar cache (confined FS) -----------------
  // Renderer packages must not write arbitrary paths; only basenames under
  // userData/Cache/settings-view are accepted.

  ipcMain.handle('atom-settings-view-cache-ensure', async () => {
    const root = settingsViewCacheRoot();
    try {
      fs.mkdirSync(root, { recursive: true });
      return root;
    } catch (error) {
      console.error('atom-settings-view-cache-ensure', error);
      return null;
    }
  });

  ipcMain.handle('atom-settings-view-cache-list', async () => {
    const root = settingsViewCacheRoot();
    try {
      return fs
        .readdirSync(root)
        .filter(name => isSafeCacheBasename(name));
    } catch (error) {
      if (error && error.code === 'ENOENT') return [];
      console.error('atom-settings-view-cache-list', error);
      return [];
    }
  });

  ipcMain.handle(
    'atom-settings-view-cache-write',
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
        console.error('atom-settings-view-cache-write', error);
        return { ok: false, error: String(error && error.message) };
      }
    }
  );

  ipcMain.handle('atom-settings-view-cache-unlink', async (_event, basename) => {
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
      console.error('atom-settings-view-cache-unlink', error);
      return false;
    }
  });

  // Path probes / bulk FS: see register-fs-ipc.js (N2.2–N2.3).

  ipcMain.on('atom-shell-beep-sync', event => {
    shell.beep();
    event.returnValue = true;
  });

  ipcMain.handle('chevron:shell-beep', () => {
    shell.beep();
    return true;
  });

  ipcMain.on('atom-app-get-path-sync', (event, name) => {
    try {
      event.returnValue = app.getPath(name);
    } catch (error) {
      event.returnValue = null;
    }
  });

  ipcMain.on('atom-app-get-version-sync', event => {
    event.returnValue = app.getVersion();
  });

  // Windows jump list (reopen-project-menu-manager)
  ipcMain.on('atom-app-get-jump-list-settings-sync', event => {
    try {
      event.returnValue =
        typeof app.getJumpListSettings === 'function'
          ? app.getJumpListSettings()
          : { removedItems: [] };
    } catch (error) {
      event.returnValue = { removedItems: [] };
    }
  });

  ipcMain.on('atom-app-set-jump-list-sync', (event, categories) => {
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

  ipcMain.on('atom-clipboard-write-text-sync', (event, text, type) => {
    try {
      if (type) clipboard.writeText(text, type);
      else clipboard.writeText(text);
      event.returnValue = true;
    } catch (error) {
      event.returnValue = false;
    }
  });

  ipcMain.on('atom-clipboard-read-text-sync', (event, type) => {
    try {
      event.returnValue = type ? clipboard.readText(type) : clipboard.readText();
    } catch (error) {
      event.returnValue = '';
    }
  });

  ipcMain.on('atom-clipboard-write-find-text-sync', (event, text) => {
    try {
      if (typeof clipboard.writeFindText === 'function') {
        clipboard.writeFindText(text);
      }
      event.returnValue = true;
    } catch (error) {
      event.returnValue = false;
    }
  });

  ipcMain.on('atom-clipboard-read-find-text-sync', event => {
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
    'atom-webcontents-send-to-window-id',
    (event, windowId, channel, ...args) => {
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

  ipcMain.on('atom-get-current-window-id-sync', event => {
    const win = browserWindowFromEvent(event);
    event.returnValue = win ? win.id : -1;
  });

  // Protocol client (settings-view); also available via ipcMain.handle elsewhere
  ipcMain.on(
    'atom-is-default-protocol-client-sync',
    (event, protocolName, execPath, args) => {
      try {
        event.returnValue = app.isDefaultProtocolClient(
          protocolName,
          execPath,
          args
        );
      } catch (error) {
        event.returnValue = false;
      }
    }
  );

  ipcMain.on(
    'atom-set-as-default-protocol-client-sync',
    (event, protocolName, execPath, args) => {
      try {
        event.returnValue = app.setAsDefaultProtocolClient(
          protocolName,
          execPath,
          args
        );
      } catch (error) {
        event.returnValue = false;
      }
    }
  );

  // --- WebContents id / send (github workers, sendTo) ------------------------

  ipcMain.on('atom-get-web-contents-id-sync', event => {
    event.returnValue = event.sender.id;
  });

  // Allow main→renderer channel used by utility workers (same as BW workers).
  // (No change to allowlist logic below; utility workers never call atom-wc-send.)

  ipcMain.on('atom-wc-send', (event, webContentsId, channel, ...args) => {
    // Git workers use atom-utility-worker-send. This channel is send-to-self only.
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

  ipcMain.on('atom-wc-is-destroyed-sync', (event, webContentsId) => {
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

  ipcMain.on('atom-utility-worker-enabled-sync', event => {
    event.returnValue = packageUtilityWorker.isEnabled();
  });

  ipcMain.handle('atom-utility-worker-capabilities', () => {
    return {
      utilityProcess: true,
      githubUtilityWorkers: packageUtilityWorker.isEnabled()
    };
  });

  ipcMain.on('atom-utility-worker-create-sync', event => {
    try {
      if (!packageUtilityWorker.isEnabled()) {
        event.returnValue = null;
        return;
      }
      const created = packageUtilityWorker.createWorker(event.sender);
      event.returnValue = created;
    } catch (error) {
      console.error('atom-utility-worker-create-sync', error);
      event.returnValue = null;
    }
  });

  ipcMain.on('atom-utility-worker-load-sync', (event, workerId, loadUrl) => {
    try {
      const meta = packageUtilityWorker.getWorker(workerId);
      if (!meta || meta.managerWcId !== event.sender.id) {
        event.returnValue = false;
        return;
      }
      event.returnValue = packageUtilityWorker.loadWorkerUrl(workerId, loadUrl);
    } catch (error) {
      console.error('atom-utility-worker-load-sync', error);
      event.returnValue = false;
    }
  });

  ipcMain.on(
    'atom-utility-worker-send',
    (event, workerId, _channel, payload) => {
      try {
        const meta = packageUtilityWorker.getWorker(workerId);
        if (!meta || meta.managerWcId !== event.sender.id) return;
        packageUtilityWorker.sendToWorker(workerId, _channel, payload);
      } catch (error) {
        console.error('atom-utility-worker-send', error);
      }
    }
  );

  ipcMain.on('atom-utility-worker-destroy-sync', (event, workerId) => {
    try {
      const meta = packageUtilityWorker.getWorker(workerId);
      if (!meta || meta.managerWcId !== event.sender.id) {
        event.returnValue = false;
        return;
      }
      event.returnValue = packageUtilityWorker.destroy(workerId);
    } catch (error) {
      console.error('atom-utility-worker-destroy-sync', error);
      event.returnValue = false;
    }
  });

  ipcMain.on('atom-utility-worker-is-destroyed-sync', (event, workerId) => {
    event.returnValue = !packageUtilityWorker.isUtilityWorker(workerId);
  });

  // Node BrowserWindow git workers are gone (PR 9). Always refuse.
  ipcMain.on('atom-create-browser-window-sync', event => {
    console.warn(
      'atom-create-browser-window-sync: refused — git workers use utilityProcess only'
    );
    event.returnValue = null;
  });

  ipcMain.on('atom-bw-id-call-sync', (event, windowId, method, ...args) => {
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

  ipcMain.on('atom-destroy-own-window-sync', event => {
    const win = browserWindowFromEvent(event);
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
    event.returnValue = true;
  });

  // --- Popup menu with click callbacks (github) -----------------------------

  ipcMain.on('atom-popup-menu', (event, sessionId, template) => {
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
      console.error('atom-popup-menu', error);
    }
  });

  // --- Open dialog (github DirectorySelect) ---------------------------------

  ipcMain.handle('atom-show-open-dialog', async (event, options) => {
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
    return lspManager.isTrusted(projectRoot);
  });

  ipcMain.handle('lsp:get-trust-state', async (_event, { projectRoot } = {}) => {
    return lspManager.getTrustState(projectRoot);
  });

  // Persist an in-editor trust decision. The Chevron modal (not a native
  // OS dialog) is the confirmation UI. start-server still refuses untrusted
  // roots. Revoking also records "declined" so we do not re-prompt.
  ipcMain.handle('lsp:set-trust', async (_event, { projectRoot, trusted } = {}) => {
    lspManager.setTrusted(projectRoot, Boolean(trusted));
    return Boolean(trusted);
  });

  // Packages declare their servers at activation so main knows which
  // commands are legitimate; see lsp-command-policy.
  ipcMain.handle('lsp:register-server', async (_event, { id, command } = {}) => {
    return lspManager.recordRegistration({ id, command });
  });

  ipcMain.handle('lsp:unregister-server', async (_event, { id } = {}) => {
    return lspManager.forgetRegistration(id);
  });

  ipcMain.handle('lsp:list-trusted', async () => {
    return lspManager.listTrusted();
  });

  ipcMain.handle('lsp:start-server', async (_event, opts = {}) => {
    return lspManager.startServer(opts);
  });

  ipcMain.handle('lsp:request', async (_event, { serverId, method, params, timeoutMs } = {}) => {
    return lspManager.request(serverId, method, params, timeoutMs);
  });

  ipcMain.handle('lsp:notify', async (_event, { serverId, method, params } = {}) => {
    return lspManager.notify(serverId, method, params);
  });

  ipcMain.handle(
    'lsp:respond',
    async (_event, { serverId, id, result, error } = {}) => {
      return lspManager.respondToServer(serverId, id, result, error);
    }
  );

  ipcMain.handle('lsp:stop-server', async (_event, { serverId } = {}) => {
    return lspManager.stopServer(serverId);
  });

  ipcMain.handle('lsp:list-servers', async () => {
    return lspManager.listServers();
  });

};
