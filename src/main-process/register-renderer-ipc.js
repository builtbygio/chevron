'use strict';

/**
 * IPC used by the renderer without electron.remote / @electron/remote.
 * Registered once from AtomApplication so handlers can resolve AtomWindow.
 */

const {
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  screen,
  shell,
  app,
  systemPreferences
} = require('electron');

let registered = false;

function browserWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

module.exports = function registerRendererIpc(atomApplication) {
  if (registered) return;
  registered = true;

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

  ipcMain.on('atom-browser-window-call-sync', (event, method, ...args) => {
    const win = browserWindowFromEvent(event);
    if (!win || !ALLOWED_WINDOW_METHODS.has(method)) {
      event.returnValue = null;
      return;
    }
    try {
      const result = win[method](...args);
      // Avoid returning non-cloneable objects over IPC
      event.returnValue = result === win ? true : result;
    } catch (error) {
      console.error(`atom-browser-window-call-sync ${method}:`, error);
      event.returnValue = null;
    }
  });

  ipcMain.on('atom-web-contents-call-sync', (event, method, ...args) => {
    const ALLOWED = new Set([
      'copy',
      'paste',
      'cut',
      'undo',
      'redo',
      'selectAll',
      'executeJavaScript'
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

  ipcMain.handle('atom-shell-open-external', async (_event, url) => {
    return shell.openExternal(url);
  });

  ipcMain.on('atom-shell-beep-sync', event => {
    shell.beep();
    event.returnValue = true;
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
};
