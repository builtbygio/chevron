'use strict';

/**
 * Partial electron.remote compatibility built on renderer-ipc.
 * Used so packages can keep calling remote.getCurrentWindow / remote.app
 * without going through @electron/remote for those APIs.
 *
 * Menu, webContents.fromId, and other advanced remote features still need
 * @electron/remote until those packages are rewritten (see inventory P3 github).
 */

const rendererIpc = require('./renderer-ipc');

function createAppProxy() {
  return {
    getPath: name => rendererIpc.appGetPath(name),
    getVersion: () => rendererIpc.appGetVersion(),
    getJumpListSettings: () => rendererIpc.getJumpListSettings(),
    setJumpList: categories => rendererIpc.setJumpList(categories),
    isDefaultProtocolClient: (protocolName, execPath, args) =>
      rendererIpc.isDefaultProtocolClient(protocolName, execPath, args),
    setAsDefaultProtocolClient: (protocolName, execPath, args) =>
      rendererIpc.setAsDefaultProtocolClient(protocolName, execPath, args),
    // no-op / best-effort for package code that emits will-quit
    emit() {}
  };
}

function createBrowserWindowShim() {
  return {
    fromId(id) {
      return {
        id,
        webContents: {
          send(channel, ...args) {
            rendererIpc.sendToWindowId(id, channel, ...args);
          }
        }
      };
    }
  };
}

module.exports = {
  getCurrentWindow: () => rendererIpc.getWindowProxy(),
  get app() {
    return createAppProxy();
  },
  get BrowserWindow() {
    return createBrowserWindowShim();
  },
  get screen() {
    return {
      getPrimaryDisplay: () => ({
        workAreaSize: rendererIpc.getPrimaryDisplayWorkAreaSize()
      })
    };
  },
  get dialog() {
    return {
      showMessageBox: options => rendererIpc.showMessageBox(options),
      showMessageBoxSync: options => rendererIpc.showMessageBoxSync(options)
    };
  },
  get systemPreferences() {
    return {
      getUserDefault: (key, type) => rendererIpc.getUserDefault(key, type)
    };
  }
};
