const {
  BrowserWindow,
  app,
  dialog,
  ipcMain,
  nativeImage
} = require('electron');
const fs = require('fs');
const getAppName = require('../get-app-name');
const path = require('path');
const url = require('url');
const { EventEmitter } = require('events');
const StartupTime = require('../startup-time');

// Linux window/taskbar icon. Prefer real filesystem paths (asar.unpacked or
// packaged app-root copies) because nativeImage.createFromPath does not read
// asar archives. Prefer taskbar-friendly sizes (256/128); 1024 alone often
// fails to show in GTK/Wayland docks.
const LINUX_ICON_SIZES = [256, 128, 64, 48, 32, 16, 512, 1024];

function iconSearchRoots(resourcePath) {
  const roots = [];
  if (process.resourcesPath) {
    roots.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'resources'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'icons'),
      path.join(process.resourcesPath, '..'),
      path.join(process.resourcesPath, 'icons')
    );
  }
  if (resourcePath) {
    roots.push(
      path.join(resourcePath, 'resources'),
      path.join(resourcePath, 'resources', 'icons')
    );
  }
  // Repo / intermediate layout (dev + copy-assets).
  const appRoot = path.resolve(__dirname, '..', '..');
  roots.push(
    path.join(appRoot, 'resources'),
    path.join(appRoot, 'resources', 'icons'),
    path.join(appRoot, 'resources', 'app-icons', 'stable', 'png')
  );
  return roots;
}

function resolveAppIconPath(resourcePath) {
  const roots = iconSearchRoots(resourcePath);
  const names = [];
  for (const size of LINUX_ICON_SIZES) {
    names.push(`${size}.png`);
  }
  names.push('atom.png', 'chevron.png');
  for (const name of names) {
    for (const root of roots) {
      const candidate = path.join(root, name);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch (_) {
        /* ignore */
      }
    }
  }
  return null;
}

function loadLinuxAppIcon(resourcePath) {
  const roots = iconSearchRoots(resourcePath);
  const image = nativeImage.createEmpty();
  let added = 0;

  for (const size of LINUX_ICON_SIZES) {
    let buffer = null;
    for (const root of roots) {
      const candidate = path.join(root, `${size}.png`);
      try {
        if (fs.existsSync(candidate)) {
          buffer = fs.readFileSync(candidate);
          break;
        }
      } catch (_) {
        /* ignore */
      }
    }
    if (!buffer) continue;
    try {
      image.addRepresentation({
        width: size,
        height: size,
        buffer,
        scaleFactor: size >= 256 ? 2.0 : 1.0
      });
      added += 1;
    } catch (_) {
      /* ignore bad representation */
    }
  }

  if (added > 0 && !image.isEmpty()) return image;

  const fallbackPath = resolveAppIconPath(resourcePath);
  if (fallbackPath) {
    const fallback = nativeImage.createFromPath(fallbackPath);
    if (!fallback.isEmpty()) return fallback;
  }
  return null;
}

// Guest <webview> may load package previews (markdown, images). Keep schemes
// tight: no javascript:, no atom: (editor protocol), no file escalation via
// unexpected schemes. file: stays for local markdown assets.
const GUEST_NAVIGATION_SCHEMES = new Set([
  'http:',
  'https:',
  'data:',
  'blob:',
  'about:',
  'file:'
]);

function isAllowedGuestNavigationUrl(navigationUrl) {
  if (typeof navigationUrl !== 'string' || navigationUrl.length === 0) {
    return false;
  }
  try {
    const parsed = new URL(navigationUrl);
    return GUEST_NAVIGATION_SCHEMES.has(parsed.protocol);
  } catch (error) {
    return false;
  }
}

let includeShellLoadTime = true;
let nextId = 0;

module.exports = class AtomWindow extends EventEmitter {
  constructor(atomApplication, fileRecoveryService, settings = {}) {
    StartupTime.addMarker('main-process:atom-window:start');

    super();

    this.id = nextId++;
    this.atomApplication = atomApplication;
    this.fileRecoveryService = fileRecoveryService;
    this.isSpec = settings.isSpec;
    this.headless = settings.headless;
    this.safeMode = settings.safeMode;
    this.devMode = settings.devMode;
    this.resourcePath = settings.resourcePath;

    const locationsToOpen = settings.locationsToOpen || [];

    this.loadedPromise = new Promise(resolve => {
      this.resolveLoadedPromise = resolve;
    });
    this.closedPromise = new Promise(resolve => {
      this.resolveClosedPromise = resolve;
    });

    // Preload boots Atom in the isolated Node world (see static/preload.js).
    // Resolve against resourcePath so packaged (asar) and --resource-path work.
    const preloadPath = path.join(this.resourcePath, 'static', 'preload.js');

    const options = {
      show: false,
      title: getAppName(),
      tabbingIdentifier: 'atom',
      webPreferences: {
        // Prevent specs from throttling when the window is in the background:
        // this should result in faster CI builds, and an improvement in the
        // local development experience when running specs through the UI (which
        // now won't pause when e.g. minimizing the window).
        backgroundThrottling: !this.isSpec,
        // Disable the `auxclick` feature so that `click` events are triggered in
        // response to a middle-click.
        // (Ref: https://github.com/atom/atom/pull/12696#issuecomment-290496960)
        disableBlinkFeatures: 'Auxclick',
        // Security (Phase I / N3 / N5) — hackable editor host:
        // - Page world: no Node (nodeIntegration false + contextIsolation).
        // - Preload world: full Node, boots Atom (static/preload.js) + packages.
        // - sandbox stays false so preload can load natives (superstring,
        //   pathwatcher, tree-sitter, oniguruma, …). Full editor sandbox is
        //   Phase S, blocked on natives — see docs/security-phase-n5.md.
        // - webviewTag remains for community packages; guests are sandboxed
        //   in will-attach-webview (N3/N4). Secondary package windows are
        //   hardened in register-renderer-ipc (N5), not the editor itself.
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: true,
        // Web Workers in the preload/package world may use require(); leave on
        // for hackable packages until audited off (Phase S later).
        nodeIntegrationInWorker: true
      },
      simpleFullscreen: this.getSimpleFullscreen()
    };

    // Don't set icon on Windows so the exe's ico will be used as window and
    // taskbar's icon. See https://github.com/atom/atom/issues/4811 for more.
    // Linux: multi-size nativeImage (single 1024 path often yields empty icon
    // in taskbars; Wayland still prefers a installed .desktop + hicolor icons).
    let linuxIcon = null;
    if (process.platform === 'linux') {
      linuxIcon = loadLinuxAppIcon(this.resourcePath);
      if (linuxIcon) options.icon = linuxIcon;
    }
    if (this.shouldAddCustomTitleBar()) options.titleBarStyle = 'hidden';
    if (this.shouldAddCustomInsetTitleBar())
      options.titleBarStyle = 'hiddenInset';
    if (this.shouldHideTitleBar()) options.frame = false;

    const BrowserWindowConstructor =
      settings.browserWindowConstructor || BrowserWindow;
    this.browserWindow = new BrowserWindowConstructor(options);

    if (linuxIcon && !this.browserWindow.isDestroyed()) {
      try {
        this.browserWindow.setIcon(linuxIcon);
      } catch (_) {
        /* ignore */
      }
      // Re-apply when shown — some WMs only pick up the icon after map.
      this.browserWindow.once('ready-to-show', () => {
        if (!this.browserWindow.isDestroyed()) {
          try {
            this.browserWindow.setIcon(linuxIcon);
          } catch (_) {
            /* ignore */
          }
        }
      });
    }

    Object.defineProperty(this.browserWindow, 'loadSettingsJSON', {
      get: () =>
        JSON.stringify(
          Object.assign(
            {
              userSettings: !this.isSpec
                ? this.atomApplication.configFile.get()
                : null
            },
            this.loadSettings
          )
        )
    });

    this.handleEvents();

    this.loadSettings = Object.assign({}, settings);
    this.loadSettings.appVersion = app.getVersion();
    this.loadSettings.appName = getAppName();
    this.loadSettings.resourcePath = this.resourcePath;
    this.loadSettings.atomHome = process.env.ATOM_HOME;
    if (this.loadSettings.devMode == null) this.loadSettings.devMode = false;
    if (this.loadSettings.safeMode == null) this.loadSettings.safeMode = false;
    if (this.loadSettings.clearWindowState == null)
      this.loadSettings.clearWindowState = false;

    this.addLocationsToOpen(locationsToOpen);

    this.loadSettings.hasOpenFiles = locationsToOpen.some(
      location => location.pathToOpen && !location.isDirectory
    );
    this.loadSettings.initialProjectRoots = this.projectRoots;

    StartupTime.addMarker('main-process:atom-window:end');

    // Expose the startup markers to the renderer process, so we can have unified
    // measures about startup time between the main process and the renderer process.
    Object.defineProperty(this.browserWindow, 'startupMarkers', {
      get: () => {
        // We only want to make the main process startup data available once,
        // so if the window is refreshed or a new window is opened, the
        // renderer process won't use it again.
        const timingData = StartupTime.exportData();
        StartupTime.deleteData();

        return timingData;
      }
    });

    // Only send to the first non-spec window created
    if (includeShellLoadTime && !this.isSpec) {
      includeShellLoadTime = false;
      if (!this.loadSettings.shellLoadTime) {
        this.loadSettings.shellLoadTime = Date.now() - global.shellStartTime;
      }
    }

    if (!this.loadSettings.env) this.env = this.loadSettings.env;

    this.browserWindow.on('window:loaded', () => {
      this.disableZoom();
      this.emit('window:loaded');
      this.resolveLoadedPromise();
    });

    this.browserWindow.on('window:locations-opened', () => {
      this.emit('window:locations-opened');
    });

    this.browserWindow.on('enter-full-screen', () => {
      this.browserWindow.webContents.send('did-enter-full-screen');
    });

    this.browserWindow.on('leave-full-screen', () => {
      this.browserWindow.webContents.send('did-leave-full-screen');
    });

    this.browserWindow.loadURL(
      url.format({
        protocol: 'file',
        pathname: `${this.resourcePath}/static/index.html`,
        slashes: true
      })
    );

    this.browserWindow.showSaveDialog = this.showSaveDialog.bind(this);

    if (this.isSpec) this.browserWindow.focusOnWebView();

    const hasPathToOpen = !(
      locationsToOpen.length === 1 && locationsToOpen[0].pathToOpen == null
    );
    if (hasPathToOpen && !this.isSpecWindow())
      this.openLocations(locationsToOpen);
  }

  hasProjectPaths() {
    return this.projectRoots.length > 0;
  }

  setupContextMenu() {
    const ContextMenu = require('./context-menu');

    this.browserWindow.on('context-menu', menuTemplate => {
      return new ContextMenu(menuTemplate, this);
    });
  }

  containsLocations(locations) {
    return locations.every(location => this.containsLocation(location));
  }

  containsLocation(location) {
    if (!location.pathToOpen) return false;

    return this.projectRoots.some(projectPath => {
      if (location.pathToOpen === projectPath) return true;
      if (location.pathToOpen.startsWith(path.join(projectPath, path.sep))) {
        if (!location.exists) return true;
        if (!location.isDirectory) return true;
      }
      return false;
    });
  }

  handleEvents() {
    this.browserWindow.on('close', async event => {
      if (
        (!this.atomApplication.quitting ||
          this.atomApplication.quittingForUpdate) &&
        !this.unloading
      ) {
        event.preventDefault();
        this.unloading = true;
        this.atomApplication.saveCurrentWindowOptions(false);
        if (await this.prepareToUnload()) this.close();
      }
    });

    this.browserWindow.on('closed', () => {
      this.fileRecoveryService.didCloseWindow(this);
      this.atomApplication.removeWindow(this);
      this.resolveClosedPromise();
    });

    this.browserWindow.on('unresponsive', async () => {
      if (this.isSpec) return;
      const result = await dialog.showMessageBox(this.browserWindow, {
        type: 'warning',
        buttons: ['Force Close', 'Keep Waiting'],
        cancelId: 1, // Canceling should be the least destructive action
        message: 'Editor is not responding',
        detail:
          'The editor is not responding. Would you like to force close it or just keep waiting?'
      });
      if (result.response === 0) this.browserWindow.destroy();
    });

    this.browserWindow.webContents.on('render-process-gone', async () => {
      if (this.headless) {
        console.log('Renderer process crashed, exiting');
        this.atomApplication.exit(100);
        return;
      }

      await this.fileRecoveryService.didCrashWindow(this);

      const result = await dialog.showMessageBox(this.browserWindow, {
        type: 'warning',
        buttons: ['Close Window', 'Reload', 'Keep It Open'],
        cancelId: 2, // Canceling should be the least destructive action
        message: 'The editor has crashed',
        detail: 'Please report this issue to https://github.com/atom/atom'
      });

      switch (result.response) {
        case 0:
          this.browserWindow.destroy();
          break;
        case 1:
          this.browserWindow.reload();
          break;
      }
    });

    this.browserWindow.webContents.on('will-navigate', (event, url) => {
      if (url !== this.browserWindow.webContents.getURL())
        event.preventDefault();
    });

    // Phase N3 / N4: guest <webview> content must never receive Node, the Atom
    // preload, or an unsandboxed renderer. Packages cannot override this via
    // webview attributes — main overwrites webPreferences on attach.
    this.browserWindow.webContents.on(
      'will-attach-webview',
      (_event, webPreferences, params) => {
        delete webPreferences.preload;
        delete webPreferences.preloadURL;
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInWorker = false;
        webPreferences.nodeIntegrationInSubFrames = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
        webPreferences.webSecurity = true;
        webPreferences.allowRunningInsecureContent = false;
        webPreferences.experimentalFeatures = false;
        // Isolate guest storage/cookies from the editor session when possible.
        if (params && typeof params === 'object' && !params.partition) {
          params.partition = 'chevron-guest';
        }
      }
    );

    // Phase N4: after attach, lock down the guest WebContents itself
    // (permissions, window.open, dangerous navigations).
    this.browserWindow.webContents.on(
      'did-attach-webview',
      (_event, guestWebContents) => {
        this.configureGuestWebContents(guestWebContents);
      }
    );

    // Deny window.open / target=_blank BrowserWindows from the renderer.
    // New editor windows go through main IPC (application:new-window, etc.).
    this.browserWindow.webContents.setWindowOpenHandler(({ url }) => {
      console.warn(
        `AtomWindow: blocked window.open from renderer (${String(url)})`
      );
      return { action: 'deny' };
    });

    // Phase N3: deny sensitive Chromium permission prompts for the editor
    // session. Packages should not rely on media/geo/notifications from the
    // editor BrowserWindow. Clipboard stay available for paste workflows.
    const session = this.browserWindow.webContents.session;
    const deniedPermissions = new Set([
      'media',
      'mediaKeySystem',
      'geolocation',
      'notifications',
      'midi',
      'midiSysex',
      'pointerLock',
      'fullscreen',
      'openExternal',
      'serial',
      'hid',
      'usb',
      'display-capture',
      'idle-detection',
      'window-management',
      'clipboard-sanitized-write'
    ]);
    // Allow nothing from the deny set; unknown permissions default deny.
    session.setPermissionRequestHandler((_wc, permission, callback) => {
      if (deniedPermissions.has(permission)) {
        console.warn(
          `AtomWindow: denied permission request "${permission}"`
        );
        callback(false);
        return;
      }
      // clipboard-read is useful for paste; still gated by user gesture in Chromium.
      if (permission === 'clipboard-read') {
        callback(true);
        return;
      }
      console.warn(
        `AtomWindow: denied unknown permission request "${permission}"`
      );
      callback(false);
    });
    session.setPermissionCheckHandler((_wc, permission) => {
      if (permission === 'clipboard-read') return true;
      if (deniedPermissions.has(permission)) return false;
      return false;
    });

    this.setupContextMenu();

    // Spec window's web view should always have focus
    if (this.isSpec)
      this.browserWindow.on('blur', () => this.browserWindow.focusOnWebView());
  }

  /**
   * Phase N4: harden a guest <webview> WebContents after attach.
   * Guests may load package previews (markdown, etc.) over http(s)/file/data.
   */
  configureGuestWebContents(guestWebContents) {
    if (!guestWebContents || guestWebContents.isDestroyed()) return;

    guestWebContents.setWindowOpenHandler(({ url: guestUrl }) => {
      console.warn(
        `AtomWindow: blocked window.open from guest webview (${String(
          guestUrl
        )})`
      );
      return { action: 'deny' };
    });

    guestWebContents.on('will-navigate', (event, navigationUrl) => {
      if (!isAllowedGuestNavigationUrl(navigationUrl)) {
        console.warn(
          `AtomWindow: blocked guest navigation to ${String(navigationUrl)}`
        );
        event.preventDefault();
      }
    });

    guestWebContents.on('will-redirect', (event, navigationUrl) => {
      if (!isAllowedGuestNavigationUrl(navigationUrl)) {
        console.warn(
          `AtomWindow: blocked guest redirect to ${String(navigationUrl)}`
        );
        event.preventDefault();
      }
    });

    // Deny all Chromium permission prompts inside guests.
    const guestSession = guestWebContents.session;
    guestSession.setPermissionRequestHandler((_wc, permission, callback) => {
      console.warn(
        `AtomWindow: denied guest permission request "${permission}"`
      );
      callback(false);
    });
    guestSession.setPermissionCheckHandler(() => false);
  }

  async prepareToUnload() {
    if (this.isSpecWindow()) return true;

    this.lastPrepareToUnloadPromise = new Promise(resolve => {
      const callback = (event, result) => {
        if (
          BrowserWindow.fromWebContents(event.sender) === this.browserWindow
        ) {
          ipcMain.removeListener('did-prepare-to-unload', callback);
          if (!result) {
            this.unloading = false;
            this.atomApplication.quitting = false;
          }
          resolve(result);
        }
      };
      ipcMain.on('did-prepare-to-unload', callback);
      this.browserWindow.webContents.send('prepare-to-unload');
    });

    return this.lastPrepareToUnloadPromise;
  }

  openPath(pathToOpen, initialLine, initialColumn) {
    return this.openLocations([{ pathToOpen, initialLine, initialColumn }]);
  }

  async openLocations(locationsToOpen) {
    this.addLocationsToOpen(locationsToOpen);
    await this.loadedPromise;
    this.sendMessage('open-locations', locationsToOpen);
  }

  didChangeUserSettings(settings) {
    this.sendMessage('did-change-user-settings', settings);
  }

  didFailToReadUserSettings(message) {
    this.sendMessage('did-fail-to-read-user-settings', message);
  }

  addLocationsToOpen(locationsToOpen) {
    const roots = new Set(this.projectRoots || []);
    for (const { pathToOpen, isDirectory } of locationsToOpen) {
      if (isDirectory) {
        roots.add(pathToOpen);
      }
    }

    this.projectRoots = Array.from(roots);
    this.projectRoots.sort();
  }

  replaceEnvironment(env) {
    const {
      NODE_ENV,
      NODE_PATH,
      ATOM_HOME,
      ATOM_DISABLE_SHELLING_OUT_FOR_ENVIRONMENT
    } = env;

    this.browserWindow.webContents.send('environment', {
      NODE_ENV,
      NODE_PATH,
      ATOM_HOME,
      ATOM_DISABLE_SHELLING_OUT_FOR_ENVIRONMENT
    });
  }

  sendMessage(message, detail) {
    this.browserWindow.webContents.send('message', message, detail);
  }

  sendCommand(command, ...args) {
    if (this.isSpecWindow()) {
      if (!this.atomApplication.sendCommandToFirstResponder(command)) {
        switch (command) {
          case 'window:reload':
            return this.reload();
          case 'window:toggle-dev-tools':
            return this.toggleDevTools();
          case 'window:close':
            return this.close();
        }
      }
    } else if (this.isWebViewFocused()) {
      this.sendCommandToBrowserWindow(command, ...args);
    } else if (!this.atomApplication.sendCommandToFirstResponder(command)) {
      this.sendCommandToBrowserWindow(command, ...args);
    }
  }

  sendURIMessage(uri) {
    this.browserWindow.webContents.send('uri-message', uri);
  }

  sendCommandToBrowserWindow(command, ...args) {
    const action =
      args[0] && args[0].contextCommand ? 'context-command' : 'command';
    this.browserWindow.webContents.send(action, command, ...args);
  }

  getDimensions() {
    const [x, y] = Array.from(this.browserWindow.getPosition());
    const [width, height] = Array.from(this.browserWindow.getSize());
    return { x, y, width, height };
  }

  getSimpleFullscreen() {
    return this.atomApplication.config.get('core.simpleFullScreenWindows');
  }

  shouldAddCustomTitleBar() {
    return (
      !this.isSpec &&
      process.platform === 'darwin' &&
      this.atomApplication.config.get('core.titleBar') === 'custom'
    );
  }

  shouldAddCustomInsetTitleBar() {
    return (
      !this.isSpec &&
      process.platform === 'darwin' &&
      this.atomApplication.config.get('core.titleBar') === 'custom-inset'
    );
  }

  shouldHideTitleBar() {
    return (
      !this.isSpec &&
      this.atomApplication.config.get('core.titleBar') === 'hidden'
    );
  }

  close() {
    return this.browserWindow.close();
  }

  focus() {
    return this.browserWindow.focus();
  }

  minimize() {
    return this.browserWindow.minimize();
  }

  maximize() {
    return this.browserWindow.maximize();
  }

  unmaximize() {
    return this.browserWindow.unmaximize();
  }

  restore() {
    return this.browserWindow.restore();
  }

  setFullScreen(fullScreen) {
    return this.browserWindow.setFullScreen(fullScreen);
  }

  setAutoHideMenuBar(autoHideMenuBar) {
    return this.browserWindow.setAutoHideMenuBar(autoHideMenuBar);
  }

  handlesAtomCommands() {
    return !this.isSpecWindow() && this.isWebViewFocused();
  }

  isFocused() {
    return this.browserWindow.isFocused();
  }

  isMaximized() {
    return this.browserWindow.isMaximized();
  }

  isMinimized() {
    return this.browserWindow.isMinimized();
  }

  isWebViewFocused() {
    return this.browserWindow.isWebViewFocused();
  }

  isSpecWindow() {
    return this.isSpec;
  }

  reload() {
    this.loadedPromise = new Promise(resolve => {
      this.resolveLoadedPromise = resolve;
    });
    this.prepareToUnload().then(canUnload => {
      if (canUnload) this.browserWindow.reload();
    });
    return this.loadedPromise;
  }

  showSaveDialog(options, callback) {
    options = Object.assign(
      {
        title: 'Save File',
        defaultPath: this.projectRoots[0]
      },
      options
    );

    let promise = dialog.showSaveDialog(this.browserWindow, options);
    if (typeof callback === 'function') {
      promise = promise.then(({ filePath, bookmark }) => {
        callback(filePath, bookmark);
      });
    }
    return promise;
  }

  toggleDevTools() {
    return this.browserWindow.toggleDevTools();
  }

  openDevTools() {
    return this.browserWindow.openDevTools();
  }

  closeDevTools() {
    return this.browserWindow.closeDevTools();
  }

  setDocumentEdited(documentEdited) {
    return this.browserWindow.setDocumentEdited(documentEdited);
  }

  setRepresentedFilename(representedFilename) {
    return this.browserWindow.setRepresentedFilename(representedFilename);
  }

  setProjectRoots(projectRootPaths) {
    this.projectRoots = projectRootPaths;
    this.projectRoots.sort();
    this.loadSettings.initialProjectRoots = this.projectRoots;
    return this.atomApplication.saveCurrentWindowOptions();
  }

  didClosePathWithWaitSession(path) {
    this.atomApplication.windowDidClosePathWithWaitSession(this, path);
  }

  copy() {
    return this.browserWindow.copy();
  }

  disableZoom() {
    return this.browserWindow.webContents.setVisualZoomLevelLimits(1, 1);
  }

  getLoadedPromise() {
    return this.loadedPromise;
  }
};
