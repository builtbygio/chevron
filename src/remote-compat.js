'use strict';

/**
 * Full electron.remote compatibility for Chevron packages (esp. github)
 * without @electron/remote. Built on renderer-ipc + main-process helpers.
 */

const { ipcRenderer } = require('electron');
const rendererIpc = require('./renderer-ipc');

// --- Menu with click callbacks ----------------------------------------------

let nextMenuSession = 1;
const menuSessions = new Map();

if (!ipcRenderer.__atomPopupMenuListener) {
  ipcRenderer.__atomPopupMenuListener = true;
  ipcRenderer.on('atom-popup-menu-click', (_event, sessionId, itemId) => {
    const callbacks = menuSessions.get(sessionId);
    if (callbacks && typeof callbacks[itemId] === 'function') {
      try {
        callbacks[itemId]();
      } catch (error) {
        console.error(error);
      }
    }
    menuSessions.delete(sessionId);
  });
}

class MenuItem {
  constructor(options = {}) {
    this.options = options;
    this.label = options.label;
    this.type = options.type;
    this.enabled = options.enabled;
    this.checked = options.checked;
    this.click = options.click;
  }
}

class Menu {
  constructor() {
    this.items = [];
  }

  append(item) {
    this.items.push(item);
    return this;
  }

  popup(_browserWindow) {
    const sessionId = nextMenuSession++;
    const callbacks = {};
    const template = this.items.map((item, index) => {
      const id = String(index);
      const opts = item.options || item;
      if (typeof opts.click === 'function') {
        callbacks[id] = opts.click;
      }
      return {
        id,
        label: opts.label,
        type: opts.type,
        enabled: opts.enabled !== false,
        checked: opts.checked
      };
    });
    menuSessions.set(sessionId, callbacks);
    ipcRenderer.send('atom-popup-menu', sessionId, template);
  }

  static buildFromTemplate(template) {
    const menu = new Menu();
    for (const item of template || []) {
      menu.append(new MenuItem(item));
    }
    return menu;
  }
}

// --- BrowserWindow (including constructor for github workers) ---------------

const workerEventHandlers = new Map(); // windowId -> { crashed: Set, destroyed: Set }

if (!ipcRenderer.__atomWorkerWindowListener) {
  ipcRenderer.__atomWorkerWindowListener = true;
  ipcRenderer.on('atom-worker-window-event', (_event, payload) => {
    const { windowId, event: eventName } = payload || {};
    const handlers = workerEventHandlers.get(windowId);
    if (!handlers) return;
    const set = handlers[eventName];
    if (set) {
      for (const fn of set) {
        try {
          fn();
        } catch (error) {
          console.error(error);
        }
      }
    }
  });
}

function createWebContentsProxy(webContentsId, windowId) {
  return {
    id: webContentsId,
    send(channel, ...args) {
      ipcRenderer.send('atom-wc-send', webContentsId, channel, ...args);
    },
    on(eventName, handler) {
      if (!windowId) return this;
      if (!workerEventHandlers.has(windowId)) {
        workerEventHandlers.set(windowId, {
          crashed: new Set(),
          destroyed: new Set()
        });
      }
      const handlers = workerEventHandlers.get(windowId);
      if (handlers[eventName]) {
        handlers[eventName].add(handler);
      }
      return this;
    },
    removeListener(eventName, handler) {
      const handlers = workerEventHandlers.get(windowId);
      if (handlers && handlers[eventName]) {
        handlers[eventName].delete(handler);
      }
      return this;
    },
    isDestroyed() {
      return ipcRenderer.sendSync('atom-wc-is-destroyed-sync', webContentsId);
    }
  };
}

function BrowserWindow(options) {
  if (!(this instanceof BrowserWindow)) {
    return new BrowserWindow(options);
  }
  const created = ipcRenderer.sendSync(
    'atom-create-browser-window-sync',
    options || {}
  );
  if (!created) {
    throw new Error('Failed to create BrowserWindow via IPC');
  }
  this.id = created.id;
  this.webContents = createWebContentsProxy(
    created.webContentsId,
    created.id
  );
}

BrowserWindow.prototype.loadURL = function(url) {
  return ipcRenderer.sendSync('atom-bw-id-call-sync', this.id, 'loadURL', url);
};

BrowserWindow.prototype.destroy = function() {
  workerEventHandlers.delete(this.id);
  return ipcRenderer.sendSync('atom-bw-id-call-sync', this.id, 'destroy');
};

BrowserWindow.prototype.isDestroyed = function() {
  return !!ipcRenderer.sendSync(
    'atom-bw-id-call-sync',
    this.id,
    'isDestroyed'
  );
};

BrowserWindow.fromId = function(id) {
  return {
    id,
    webContents: {
      send(channel, ...args) {
        rendererIpc.sendToWindowId(id, channel, ...args);
      }
    },
    isDestroyed() {
      return !!ipcRenderer.sendSync('atom-bw-id-call-sync', id, 'isDestroyed');
    },
    destroy() {
      return ipcRenderer.sendSync('atom-bw-id-call-sync', id, 'destroy');
    }
  };
};

BrowserWindow.fromWebContents = function() {
  // Best-effort: current window
  const id = rendererIpc.getCurrentWindowId();
  return BrowserWindow.fromId(id);
};

// --- App / dialog / screen --------------------------------------------------

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
    emit() {}
  };
}

function createDialogProxy() {
  return {
    showMessageBox: (winOrOpts, maybeOpts) => {
      const options = maybeOpts !== undefined ? maybeOpts : winOrOpts;
      return rendererIpc.showMessageBox(options);
    },
    showMessageBoxSync: (winOrOpts, maybeOpts) => {
      const options = maybeOpts !== undefined ? maybeOpts : winOrOpts;
      return rendererIpc.showMessageBoxSync(options);
    },
    showOpenDialog: (winOrOpts, maybeOpts) => {
      const options = maybeOpts !== undefined ? maybeOpts : winOrOpts;
      return ipcRenderer.invoke('atom-show-open-dialog', options || {});
    },
    showSaveDialog: (winOrOpts, maybeOpts) => {
      const options = maybeOpts !== undefined ? maybeOpts : winOrOpts;
      return rendererIpc.showSaveDialog(options);
    }
  };
}

const webContentsApi = {
  fromId(id) {
    return createWebContentsProxy(id, null);
  }
};

module.exports = {
  getCurrentWindow: () => rendererIpc.getWindowProxy(),
  getCurrentWebContents: () =>
    createWebContentsProxy(
      ipcRenderer.sendSync('atom-get-web-contents-id-sync'),
      rendererIpc.getCurrentWindowId()
    ),
  get app() {
    return createAppProxy();
  },
  get BrowserWindow() {
    return BrowserWindow;
  },
  get Menu() {
    return Menu;
  },
  get MenuItem() {
    return MenuItem;
  },
  get dialog() {
    return createDialogProxy();
  },
  get screen() {
    return {
      getPrimaryDisplay: () => ({
        workAreaSize: rendererIpc.getPrimaryDisplayWorkAreaSize()
      })
    };
  },
  get systemPreferences() {
    return {
      getUserDefault: (key, type) => rendererIpc.getUserDefault(key, type)
    };
  },
  get webContents() {
    return webContentsApi;
  },
  get process() {
    return process;
  }
};
