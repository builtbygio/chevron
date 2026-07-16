// ApplicationDelegate talks to main via IPC (no electron.remote for core paths).
const { ipcRenderer } = require('electron');
const ipcHelpers = require('./ipc-helpers');
const rendererIpc = require('./renderer-ipc');
const { Emitter, Disposable } = require('event-kit');
const getWindowLoadSettings = require('./get-window-load-settings');

module.exports = class ApplicationDelegate {
  constructor() {
    this.pendingSettingsUpdateCount = 0;
    this._ipcMessageEmitter = null;
  }

  ipcMessageEmitter() {
    if (!this._ipcMessageEmitter) {
      this._ipcMessageEmitter = new Emitter();
      ipcRenderer.on('message', (event, message, detail) => {
        this._ipcMessageEmitter.emit(message, detail);
      });
    }
    return this._ipcMessageEmitter;
  }

  getWindowLoadSettings() {
    return getWindowLoadSettings();
  }

  open(params) {
    return ipcRenderer.send('open', params);
  }

  pickFolder(callback) {
    const responseChannel = 'atom-pick-folder-response';
    ipcRenderer.on(responseChannel, function(event, path) {
      ipcRenderer.removeAllListeners(responseChannel);
      return callback(path);
    });
    return ipcRenderer.send('pick-folder', responseChannel);
  }

  getCurrentWindow() {
    return rendererIpc.getWindowProxy();
  }

  closeWindow() {
    return ipcHelpers.call('window-method', 'close');
  }

  async getTemporaryWindowState() {
    const stateJSON = await ipcHelpers.call('get-temporary-window-state');
    return stateJSON && JSON.parse(stateJSON);
  }

  setTemporaryWindowState(state) {
    return ipcHelpers.call('set-temporary-window-state', JSON.stringify(state));
  }

  getWindowSize() {
    const size = rendererIpc.getWindowProxy().getSize();
    const [width, height] = Array.from(size || [0, 0]);
    return { width, height };
  }

  setWindowSize(width, height) {
    return ipcHelpers.call('set-window-size', width, height);
  }

  getWindowPosition() {
    const pos = rendererIpc.getWindowProxy().getPosition();
    const [x, y] = Array.from(pos || [0, 0]);
    return { x, y };
  }

  setWindowPosition(x, y) {
    return ipcHelpers.call('set-window-position', x, y);
  }

  centerWindow() {
    return ipcHelpers.call('center-window');
  }

  focusWindow() {
    return ipcHelpers.call('focus-window');
  }

  showWindow() {
    return ipcHelpers.call('show-window');
  }

  hideWindow() {
    return ipcHelpers.call('hide-window');
  }

  reloadWindow() {
    return ipcHelpers.call('window-method', 'reload');
  }

  restartApplication() {
    return ipcRenderer.send('restart-application');
  }

  minimizeWindow() {
    return ipcHelpers.call('window-method', 'minimize');
  }

  isWindowMaximized() {
    return rendererIpc.getWindowProxy().isMaximized();
  }

  maximizeWindow() {
    return ipcHelpers.call('window-method', 'maximize');
  }

  unmaximizeWindow() {
    return ipcHelpers.call('window-method', 'unmaximize');
  }

  isWindowFullScreen() {
    return rendererIpc.getWindowProxy().isFullScreen();
  }

  setWindowFullScreen(fullScreen = false) {
    return ipcHelpers.call('window-method', 'setFullScreen', fullScreen);
  }

  onDidEnterFullScreen(callback) {
    return ipcHelpers.on(ipcRenderer, 'did-enter-full-screen', callback);
  }

  onDidLeaveFullScreen(callback) {
    return ipcHelpers.on(ipcRenderer, 'did-leave-full-screen', callback);
  }

  async openWindowDevTools() {
    await new Promise(process.nextTick);
    return ipcHelpers.call('window-method', 'openDevTools');
  }

  async closeWindowDevTools() {
    await new Promise(process.nextTick);
    return ipcHelpers.call('window-method', 'closeDevTools');
  }

  async toggleWindowDevTools() {
    await new Promise(process.nextTick);
    return ipcHelpers.call('window-method', 'toggleDevTools');
  }

  executeJavaScriptInWindowDevTools(code) {
    return ipcRenderer.send('execute-javascript-in-dev-tools', code);
  }

  didClosePathWithWaitSession(path) {
    return ipcHelpers.call(
      'window-method',
      'didClosePathWithWaitSession',
      path
    );
  }

  setWindowDocumentEdited(edited) {
    return ipcHelpers.call('window-method', 'setDocumentEdited', edited);
  }

  setRepresentedFilename(filename) {
    return ipcHelpers.call('window-method', 'setRepresentedFilename', filename);
  }

  addRecentDocument(filename) {
    return ipcRenderer.send('add-recent-document', filename);
  }

  setProjectRoots(paths) {
    return ipcHelpers.call('window-method', 'setProjectRoots', paths);
  }

  setAutoHideWindowMenuBar(autoHide) {
    return ipcHelpers.call('window-method', 'setAutoHideMenuBar', autoHide);
  }

  setWindowMenuBarVisibility(visible) {
    return rendererIpc.getWindowProxy().setMenuBarVisibility(visible);
  }

  getPrimaryDisplayWorkAreaSize() {
    return rendererIpc.getPrimaryDisplayWorkAreaSize();
  }

  getUserDefault(key, type) {
    return rendererIpc.getUserDefault(key, type);
  }

  async setUserSettings(config, configFilePath) {
    this.pendingSettingsUpdateCount++;
    try {
      await ipcHelpers.call(
        'set-user-settings',
        JSON.stringify(config),
        configFilePath
      );
    } finally {
      this.pendingSettingsUpdateCount--;
    }
  }

  onDidChangeUserSettings(callback) {
    return this.ipcMessageEmitter().on('did-change-user-settings', detail => {
      if (this.pendingSettingsUpdateCount === 0) callback(detail);
    });
  }

  onDidFailToReadUserSettings(callback) {
    return this.ipcMessageEmitter().on(
      'did-fail-to-read-user-setting',
      callback
    );
  }

  confirm(options, callback) {
    if (typeof callback === 'function') {
      options = Object.assign(
        { type: 'info', normalizeAccessKeys: true },
        options
      );
      rendererIpc.showMessageBox(options).then(result => {
        callback(result.response, result.checkboxChecked);
      });
    } else {
      let { message, detailedMessage, buttons } = options;

      let buttonLabels;
      if (!buttons) buttons = {};
      if (Array.isArray(buttons)) {
        buttonLabels = buttons;
      } else {
        buttonLabels = Object.keys(buttons);
      }

      const chosen = rendererIpc.showMessageBoxSync({
        type: 'info',
        message,
        detail: detailedMessage,
        buttons: buttonLabels,
        normalizeAccessKeys: true
      });

      if (Array.isArray(buttons)) {
        return chosen;
      } else {
        const buttonCallback = buttons[buttonLabels[chosen]];
        if (typeof buttonCallback === 'function') return buttonCallback();
      }
    }
  }

  showMessageDialog(params) {}

  showSaveDialog(options, callback) {
    if (typeof callback === 'function') {
      this.getCurrentWindow().showSaveDialog(options, callback);
    } else {
      if (typeof options === 'string') {
        options = { defaultPath: options };
      }
      return this.getCurrentWindow().showSaveDialog(options);
    }
  }

  playBeepSound() {
    return rendererIpc.beep();
  }

  onDidOpenLocations(callback) {
    return this.ipcMessageEmitter().on('open-locations', callback);
  }

  onUpdateAvailable(callback) {
    return this.ipcMessageEmitter().on(
      'did-begin-downloading-update',
      callback
    );
  }

  onDidBeginDownloadingUpdate(callback) {
    return this.onUpdateAvailable(callback);
  }

  onDidBeginCheckingForUpdate(callback) {
    return this.ipcMessageEmitter().on('checking-for-update', callback);
  }

  onDidCompleteDownloadingUpdate(callback) {
    return this.ipcMessageEmitter().on('update-available', callback);
  }

  onUpdateNotAvailable(callback) {
    return this.ipcMessageEmitter().on('update-not-available', callback);
  }

  onUpdateError(callback) {
    return this.ipcMessageEmitter().on('update-error', callback);
  }

  onApplicationMenuCommand(handler) {
    const outerCallback = (event, ...args) => handler(...args);

    ipcRenderer.on('command', outerCallback);
    return new Disposable(() =>
      ipcRenderer.removeListener('command', outerCallback)
    );
  }

  onContextMenuCommand(handler) {
    const outerCallback = (event, ...args) => handler(...args);

    ipcRenderer.on('context-command', outerCallback);
    return new Disposable(() =>
      ipcRenderer.removeListener('context-command', outerCallback)
    );
  }

  onURIMessage(handler) {
    const outerCallback = (event, ...args) => handler(...args);

    ipcRenderer.on('uri-message', outerCallback);
    return new Disposable(() =>
      ipcRenderer.removeListener('uri-message', outerCallback)
    );
  }

  onDidRequestUnload(callback) {
    const outerCallback = async (event, message) => {
      const shouldUnload = await callback(event);
      ipcRenderer.send('did-prepare-to-unload', shouldUnload);
    };

    ipcRenderer.on('prepare-to-unload', outerCallback);
    return new Disposable(() =>
      ipcRenderer.removeListener('prepare-to-unload', outerCallback)
    );
  }

  onDidChangeHistoryManager(callback) {
    const outerCallback = (event, message) => callback(event);

    ipcRenderer.on('did-change-history-manager', outerCallback);
    return new Disposable(() =>
      ipcRenderer.removeListener('did-change-history-manager', outerCallback)
    );
  }

  didChangeHistoryManager() {
    return ipcRenderer.send('did-change-history-manager');
  }

  openExternal(url) {
    return rendererIpc.openExternal(url);
  }

  showItemInFolder(fullPath) {
    return rendererIpc.showItemInFolder(fullPath);
  }

  moveItemToTrash(fullPath) {
    return rendererIpc.moveItemToTrash(fullPath);
  }

  checkForUpdate() {
    return ipcRenderer.send('command', 'application:check-for-update');
  }

  restartAndInstallUpdate() {
    return ipcRenderer.send('command', 'application:install-update');
  }

  getAutoUpdateManagerState() {
    return ipcRenderer.sendSync('get-auto-update-manager-state');
  }

  getAutoUpdateManagerErrorMessage() {
    return ipcRenderer.sendSync('get-auto-update-manager-error');
  }

  emitWillSavePath(path) {
    return ipcHelpers.call('will-save-path', path);
  }

  emitDidSavePath(path) {
    return ipcHelpers.call('did-save-path', path);
  }

  resolveProxy(requestId, url) {
    return ipcRenderer.send('resolve-proxy', requestId, url);
  }

  onDidResolveProxy(callback) {
    const outerCallback = (event, requestId, proxy) =>
      callback(requestId, proxy);

    ipcRenderer.on('did-resolve-proxy', outerCallback);
    return new Disposable(() =>
      ipcRenderer.removeListener('did-resolve-proxy', outerCallback)
    );
  }
};
