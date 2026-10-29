'use strict';

/**
 * electron.remote compatibility shim without @electron/remote.
 * Built on renderer-ipc + main-process helpers. Owned packages (github)
 * should prefer require('chevron').Menu / MenuItem / openUtilityWorkerWindow
 * and chevron.getCurrentWindow(); this module remains the implementation and
 * the value assigned to electron.remote in preload.
 */

const { ipcRenderer } = require('electron');
const rendererIpc = require('./renderer-ipc');

// --- Menu with click callbacks ----------------------------------------------

let nextMenuSession = 1;
const menuSessions = new Map();

if (!ipcRenderer.__atomPopupMenuListener) {
  ipcRenderer.__atomPopupMenuListener = true;
  ipcRenderer.on('chevron:popup-menu-click', (_event, sessionId, itemId) => {
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
    ipcRenderer.send('chevron:popup-menu', sessionId, template);
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
  ipcRenderer.on('chevron:worker-window-event', (_event, payload) => {
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
      ipcRenderer.send('chevron:wc-send', webContentsId, channel, ...args);
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
      return ipcRenderer
        .invoke('chevron:wc-is-destroyed', webContentsId)
        .then(destroyed => !!destroyed);
    }
  };
}

async function createUtilityWorkerWindow() {
  const created = await ipcRenderer.invoke('chevron:utility-worker-create');
  if (!created) {
    throw new Error('Failed to create utilityProcess git worker via IPC');
  }
  const windowId = created.id;
  const webContentsId = created.webContentsId;
  return {
    id: windowId,
    webContents: {
      id: webContentsId,
      send(channel, ...args) {
        // github WorkerManager: webContents.send(channel, { type, data })
        const payload = args[0];
        ipcRenderer.send(
          'chevron:utility-worker-send',
          windowId,
          channel,
          payload
        );
      },
      on(eventName, handler) {
        if (!workerEventHandlers.has(windowId)) {
          workerEventHandlers.set(windowId, {
            crashed: new Set(),
            destroyed: new Set()
          });
        }
        const handlers = workerEventHandlers.get(windowId);
        if (handlers[eventName]) handlers[eventName].add(handler);
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
        return ipcRenderer
          .invoke('chevron:utility-worker-is-destroyed', windowId)
          .then(destroyed => !!destroyed);
      }
    },
    loadURL(url) {
      return ipcRenderer.invoke('chevron:utility-worker-load', windowId, url);
    },
    destroy() {
      workerEventHandlers.delete(windowId);
      return ipcRenderer.invoke('chevron:utility-worker-destroy', windowId);
    },
    isDestroyed() {
      return ipcRenderer
        .invoke('chevron:utility-worker-is-destroyed', windowId)
        .then(destroyed => !!destroyed);
    }
  };
}

// Git workers are utilityProcess only (architecture H1 PR 9). Creating one
// yields, so callers open it instead of constructing it on the same turn.
function BrowserWindow() {
  throw new Error('Call BrowserWindow.open()');
}

BrowserWindow.open = function() {
  return createUtilityWorkerWindow();
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
      return ipcRenderer
        .invoke('chevron:bw-id-call', id, 'isDestroyed')
        .then(destroyed => !!destroyed);
    },
    destroy() {
      return ipcRenderer.invoke('chevron:bw-id-call', id, 'destroy');
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
    getJumpListSettings: () => rendererIpc.getJumpListSettingsAsync(),
    setJumpList: categories => rendererIpc.setJumpListAsync(categories),
    isDefaultProtocolClient: (protocolName, _execPath, args) =>
      ipcRenderer.invoke('chevron:is-default-protocol-client', {
        protocol: protocolName,
        args
      }),
    setAsDefaultProtocolClient: (protocolName, _execPath, args) =>
      ipcRenderer.invoke('chevron:set-as-default-protocol-client', {
        protocol: protocolName,
        args
      }),
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
      return ipcRenderer.invoke('chevron:show-open-dialog', options || {});
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
      ipcRenderer.sendSync('chevron:get-web-contents-id-sync'),
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
      getPrimaryDisplay: () =>
        rendererIpc.getPrimaryDisplayWorkAreaSizeAsync().then(workAreaSize => ({
          workAreaSize
        })),
    };
  },
  get systemPreferences() {
    return {
      getUserDefault: (key, type) => rendererIpc.getUserDefaultAsync(key, type)
    };
  },
  get webContents() {
    return webContentsApi;
  },
  get process() {
    return process;
  }
};
