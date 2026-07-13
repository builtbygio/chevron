'use strict';

/**
 * Renderer-side helpers that talk to main without electron.remote.
 * Used by ApplicationDelegate, load settings, packages (via thin wrappers).
 */

const { ipcRenderer } = require('electron');

function windowCall(method, ...args) {
  return ipcRenderer.sendSync('atom-browser-window-call-sync', method, ...args);
}

function webContentsCall(method, ...args) {
  return ipcRenderer.sendSync('atom-web-contents-call-sync', method, ...args);
}

function createWindowProxy() {
  const proxy = {
    getSize: () => windowCall('getSize') || [0, 0],
    getPosition: () => windowCall('getPosition') || [0, 0],
    isMaximized: () => !!windowCall('isMaximized'),
    isFullScreen: () => !!windowCall('isFullScreen'),
    isFocused: () => !!windowCall('isFocused'),
    isMinimized: () => !!windowCall('isMinimized'),
    isVisible: () => !!windowCall('isVisible'),
    isWebViewFocused: () => !!windowCall('isWebViewFocused'),
    setSize: (w, h) => windowCall('setSize', w, h),
    setPosition: (x, y) => windowCall('setPosition', x, y),
    center: () => windowCall('center'),
    show: () => windowCall('show'),
    hide: () => windowCall('hide'),
    focus: () => windowCall('focus'),
    minimize: () => windowCall('minimize'),
    maximize: () => windowCall('maximize'),
    unmaximize: () => windowCall('unmaximize'),
    restore: () => windowCall('restore'),
    close: () => windowCall('close'),
    openDevTools: () => windowCall('openDevTools'),
    closeDevTools: () => windowCall('closeDevTools'),
    toggleDevTools: () => windowCall('toggleDevTools'),
    setFullScreen: v => windowCall('setFullScreen', v),
    setMenuBarVisibility: v => windowCall('setMenuBarVisibility', v),
    setAutoHideMenuBar: v => windowCall('setAutoHideMenuBar', v),
    setDocumentEdited: v => windowCall('setDocumentEdited', v),
    setRepresentedFilename: v => windowCall('setRepresentedFilename', v),
    setSheetOffset: v => windowCall('setSheetOffset', v),
    setTitle: v => windowCall('setTitle', v),
    // loadSettingsJSON / startupMarkers for any leftover direct access
    get loadSettingsJSON() {
      return ipcRenderer.sendSync('atom-window-load-settings-sync');
    },
    get startupMarkers() {
      return ipcRenderer.sendSync('atom-window-startup-markers-sync');
    },
    get webContents() {
      const wcId = ipcRenderer.sendSync('atom-get-web-contents-id-sync');
      return {
        id: wcId,
        copy: () => webContentsCall('copy'),
        paste: () => webContentsCall('paste'),
        cut: () => webContentsCall('cut'),
        undo: () => webContentsCall('undo'),
        redo: () => webContentsCall('redo'),
        selectAll: () => webContentsCall('selectAll'),
        executeJavaScript: (code, userGesture) =>
          webContentsCall('executeJavaScript', code, userGesture),
        send: (channel, ...args) =>
          ipcRenderer.send('atom-wc-send', wcId, channel, ...args)
      };
    },
    // showSaveDialog was patched onto BrowserWindow by AtomWindow; use IPC
    showSaveDialog(options, callback) {
      const promise = ipcRenderer.invoke('atom-show-save-dialog', options || {});
      if (typeof callback === 'function') {
        promise.then(result => {
          // Electron returns { filePath, bookmark } or canceled
          if (result && result.canceled) callback(undefined);
          else if (result && 'filePath' in result) callback(result.filePath);
          else callback(result);
        });
        return promise;
      }
      return promise;
    },
    // Not fully supported; packages that emit on window should use IPC
    emit(channel, ...args) {
      if (channel === 'context-menu') {
        ipcRenderer.send('atom-context-menu', args[0]);
        return true;
      }
      console.warn(
        `windowProxy.emit('${channel}') is not supported without remote`
      );
      return false;
    }
  };
  return proxy;
}

let windowProxy = null;

module.exports = {
  getLoadSettingsJSON() {
    return ipcRenderer.sendSync('atom-window-load-settings-sync');
  },

  getStartupMarkers() {
    return ipcRenderer.sendSync('atom-window-startup-markers-sync');
  },

  getWindowProxy() {
    if (!windowProxy) windowProxy = createWindowProxy();
    return windowProxy;
  },

  showMessageBox(options) {
    return ipcRenderer.invoke('atom-show-message-box', options);
  },

  showMessageBoxSync(options) {
    return ipcRenderer.sendSync('atom-show-message-box-sync', options);
  },

  showSaveDialog(options) {
    return ipcRenderer.invoke('atom-show-save-dialog', options);
  },

  getPrimaryDisplayWorkAreaSize() {
    return ipcRenderer.sendSync('atom-get-primary-display-work-area-size-sync');
  },

  getUserDefault(key, type) {
    return ipcRenderer.sendSync('atom-get-user-default-sync', key, type);
  },

  openExternal(url) {
    return ipcRenderer.invoke('atom-shell-open-external', url);
  },

  beep() {
    return ipcRenderer.sendSync('atom-shell-beep-sync');
  },

  appGetPath(name) {
    return ipcRenderer.sendSync('atom-app-get-path-sync', name);
  },

  appGetVersion() {
    return ipcRenderer.sendSync('atom-app-get-version-sync');
  },

  getJumpListSettings() {
    return ipcRenderer.sendSync('atom-app-get-jump-list-settings-sync');
  },

  setJumpList(categories) {
    return ipcRenderer.sendSync('atom-app-set-jump-list-sync', categories);
  },

  clipboardWriteText(text, type) {
    return ipcRenderer.sendSync('atom-clipboard-write-text-sync', text, type);
  },

  clipboardReadText(type) {
    return ipcRenderer.sendSync('atom-clipboard-read-text-sync', type);
  },

  clipboardWriteFindText(text) {
    return ipcRenderer.sendSync('atom-clipboard-write-find-text-sync', text);
  },

  clipboardReadFindText() {
    return ipcRenderer.sendSync('atom-clipboard-read-find-text-sync');
  },

  sendContextMenu(menuTemplate) {
    ipcRenderer.send('atom-context-menu', menuTemplate);
  },

  getCurrentWindowId() {
    return ipcRenderer.sendSync('atom-get-current-window-id-sync');
  },

  sendToWindowId(windowId, channel, ...args) {
    ipcRenderer.send(
      'atom-webcontents-send-to-window-id',
      windowId,
      channel,
      ...args
    );
  },

  isDefaultProtocolClient(protocolName, execPath, args) {
    return ipcRenderer.sendSync(
      'atom-is-default-protocol-client-sync',
      protocolName,
      execPath,
      args
    );
  },

  setAsDefaultProtocolClient(protocolName, execPath, args) {
    return ipcRenderer.sendSync(
      'atom-set-as-default-protocol-client-sync',
      protocolName,
      execPath,
      args
    );
  }
};
