'use strict';

/**
 * IPC used by the renderer without electron.remote / @electron/remote.
 * Registered once from AtomApplication so handlers can resolve AtomWindow.
 */

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

// Hidden windows created for packages (e.g. github git workers)
const createdWindows = new Map(); // windowId -> BrowserWindow

function browserWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function resolveWindow(windowId) {
  return (
    createdWindows.get(windowId) ||
    BrowserWindow.fromId(windowId) ||
    null
  );
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

  // --- WebContents id / send (github workers, sendTo) ------------------------

  ipcMain.on('atom-get-web-contents-id-sync', event => {
    event.returnValue = event.sender.id;
  });

  ipcMain.on('atom-wc-send', (event, webContentsId, channel, ...args) => {
    try {
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
      const wc = webContents.fromId(webContentsId);
      event.returnValue = !wc || wc.isDestroyed();
    } catch (error) {
      event.returnValue = true;
    }
  });

  // --- Create BrowserWindow from renderer (github WorkerManager) ------------

  ipcMain.on('atom-create-browser-window-sync', (event, options = {}) => {
    try {
      // GitHub git workers are trusted hidden windows: they need Node require()
      // in the page (worker.js) and do not use the main Atom preload.
      const webPreferences = Object.assign(
        {
          nodeIntegration: true,
          contextIsolation: false,
          sandbox: false,
          enableRemoteModule: false
        },
        options.webPreferences || {}
      );
      delete webPreferences.enableRemoteModule;

      const win = new BrowserWindow(
        Object.assign({}, options, { webPreferences })
      );
      createdWindows.set(win.id, win);

      const managerWc = event.sender;
      const destroyWorker = () => {
        if (!win.isDestroyed()) win.destroy();
      };
      // If the manager renderer dies, tear down its worker windows
      managerWc.once('destroyed', destroyWorker);
      managerWc.once('render-process-gone', destroyWorker);
      managerWc.once('crashed', destroyWorker);

      win.on('closed', () => {
        createdWindows.delete(win.id);
        try {
          managerWc.removeListener('destroyed', destroyWorker);
          managerWc.removeListener('render-process-gone', destroyWorker);
          managerWc.removeListener('crashed', destroyWorker);
        } catch (e) {
          /* ignore */
        }
      });

      // Forward worker crash to manager renderer
      const forward = name => {
        if (!managerWc.isDestroyed()) {
          managerWc.send('atom-worker-window-event', {
            windowId: win.id,
            webContentsId: win.webContents.id,
            event: name
          });
        }
      };
      win.webContents.on('crashed', () => forward('crashed'));
      win.webContents.on('render-process-gone', () => forward('crashed'));
      win.webContents.on('destroyed', () => forward('destroyed'));

      event.returnValue = {
        id: win.id,
        webContentsId: win.webContents.id
      };
    } catch (error) {
      console.error('atom-create-browser-window-sync', error);
      event.returnValue = null;
    }
  });

  ipcMain.on('atom-bw-id-call-sync', (event, windowId, method, ...args) => {
    const win = resolveWindow(windowId);
    if (!win || win.isDestroyed()) {
      event.returnValue =
        method === 'isDestroyed' ? true : method === 'destroy' ? true : null;
      return;
    }
    try {
      if (method === 'isDestroyed') {
        event.returnValue = win.isDestroyed();
        return;
      }
      if (method === 'destroy') {
        win.destroy();
        event.returnValue = true;
        return;
      }
      if (method === 'loadURL') {
        win.loadURL(args[0]);
        event.returnValue = true;
        return;
      }
      if (typeof win[method] === 'function') {
        const result = win[method](...args);
        event.returnValue = result === win ? true : result;
        return;
      }
      event.returnValue = null;
    } catch (error) {
      console.error(`atom-bw-id-call-sync ${method}:`, error);
      event.returnValue = null;
    }
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
};
