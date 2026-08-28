'use strict';

/**
 * Stub `chevron` proxy handed to T2 packages inside the package host
 * (Epic 21, slice 21.2).
 *
 * Everything here must be RPC-friendly: structured-clone / JSON only. Anything
 * that would return a live DOM node is absent by design — a package that needs
 * one is not host-eligible and stays editor-side under v1 (slice 21.4).
 *
 * Reads are served from a **config snapshot** pushed at activate time, because
 * packages call `chevron.config.get()` synchronously during `activate()` and
 * the real config lives in the editor process. Writes and side effects are
 * fire-and-forget descriptors emitted back to the editor.
 *
 * See docs/reference/security-phase-s-package-host.md "`atom.*` proxy surface".
 */

/** Minimal Disposable, structurally compatible with event-kit. */
class HostDisposable {
  constructor(dispose) {
    this._dispose = typeof dispose === 'function' ? dispose : () => {};
    this.disposed = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this._dispose();
  }
}

class HostCompositeDisposable {
  constructor(...items) {
    this.items = new Set(items);
    this.disposed = false;
  }
  add(...items) {
    for (const i of items) this.items.add(i);
    return this;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const i of this.items) {
      if (i && typeof i.dispose === 'function') i.dispose();
    }
    this.items.clear();
  }
}

function getIn(object, keyPath) {
  if (!keyPath) return object;
  let cursor = object;
  for (const key of String(keyPath).split('.')) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = cursor[key];
  }
  return cursor;
}

function setIn(object, keyPath, value) {
  const keys = String(keyPath).split('.');
  let cursor = object;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cursor[keys[i]] == null || typeof cursor[keys[i]] !== 'object') {
      cursor[keys[i]] = {};
    }
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
}

/**
 * @param {object} options
 * @param {string} options.packageName
 * @param {object} options.configSnapshot  plain object, dotted paths resolved by getIn
 * @param {(descriptor: object) => void} options.emit  send a descriptor to the editor
 */
function createStub({ packageName, configSnapshot = {}, emit }) {
  const config = JSON.parse(JSON.stringify(configSnapshot || {}));
  /** keyPath -> Set<callback> */
  const configObservers = new Map();
  /** commandName -> callback */
  const commands = new Map();
  const emitted = [];

  function send(descriptor) {
    emitted.push(descriptor);
    if (typeof emit === 'function') emit(descriptor);
  }

  const stub = {
    /** Marks this object as the host stub, for tests and for package authors. */
    isPackageHostStub: true,
    packageName,

    config: {
      get(keyPath) {
        return getIn(config, keyPath);
      },
      set(keyPath, value) {
        setIn(config, keyPath, value);
        send({ kind: 'config.set', keyPath, value });
        const observers = configObservers.get(keyPath);
        if (observers) for (const cb of observers) cb(value);
        return true;
      },
      observe(keyPath, callback) {
        if (!configObservers.has(keyPath)) configObservers.set(keyPath, new Set());
        configObservers.get(keyPath).add(callback);
        // event-kit contract: observe fires immediately with the current value
        callback(getIn(config, keyPath));
        return new HostDisposable(() => {
          const set = configObservers.get(keyPath);
          if (set) set.delete(callback);
        });
      }
    },

    commands: {
      add(target, commandsOrName, maybeCallback) {
        // Only the string-target form is host-eligible; a DOM element target
        // cannot cross the process boundary.
        if (typeof target !== 'string') {
          throw new Error(
            '[chevron-package-host] chevron.commands.add requires a selector ' +
              'string in the package host; element targets are editor-side only.'
          );
        }
        const composite = new HostCompositeDisposable();
        const entries =
          typeof commandsOrName === 'string'
            ? { [commandsOrName]: maybeCallback }
            : commandsOrName || {};
        for (const [name, callback] of Object.entries(entries)) {
          commands.set(name, callback);
          send({ kind: 'commands.add', target, name });
          composite.add(
            new HostDisposable(() => {
              commands.delete(name);
              send({ kind: 'commands.remove', target, name });
            })
          );
        }
        return composite;
      }
    },

    notifications: {
      addSuccess: (message, opts) =>
        send({ kind: 'notifications.add', level: 'success', message, options: opts }),
      addInfo: (message, opts) =>
        send({ kind: 'notifications.add', level: 'info', message, options: opts }),
      addWarning: (message, opts) =>
        send({ kind: 'notifications.add', level: 'warning', message, options: opts }),
      addError: (message, opts) =>
        send({ kind: 'notifications.add', level: 'error', message, options: opts }),
      addFatalError: (message, opts) =>
        send({ kind: 'notifications.add', level: 'fatal', message, options: opts })
    },

    workspace: {
      // URI-addressed only. No pane items, no DOM.
      open: (uri, options) => {
        send({ kind: 'workspace.open', uri, options });
        return Promise.resolve({ uri });
      }
    },

    project: {
      getPaths: () => (configSnapshot.__projectPaths || []).slice()
    },

    // event-kit surface packages construct directly
    Disposable: HostDisposable,
    CompositeDisposable: HostCompositeDisposable
  };

  return {
    stub,
    /** Dispatch a command the editor forwarded to us. */
    dispatchCommand(name, detail) {
      const cb = commands.get(name);
      if (!cb) return { dispatched: false };
      cb(detail);
      return { dispatched: true };
    },
    /** Push a config change from the editor into the snapshot + observers. */
    applyConfigChange(keyPath, value) {
      setIn(config, keyPath, value);
      const observers = configObservers.get(keyPath);
      if (observers) for (const cb of observers) cb(value);
    },
    commandNames: () => [...commands.keys()],
    emitted: () => emitted.slice()
  };
}

module.exports = {
  createStub,
  HostDisposable,
  HostCompositeDisposable
};
