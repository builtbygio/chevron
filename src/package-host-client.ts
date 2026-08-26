'use strict';

/**
 * Renderer-side client for package host v2 (Epic 21).
 *
 * PackageManager uses this to activate eligible community packages in the
 * restricted utilityProcess instead of requiring their main module in the
 * editor preload. Contributions come back as serializable descriptors.
 *
 * Gated by core.packageHostV2 / CHEVRON_PACKAGE_HOST_V2 (default off).
 */

interface IpcRendererLike {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, listener: (...args: any[]) => void) => void;
}

interface HostDisposable {
  dispose: () => void;
}

interface HostPack {
  name: string;
  activationDisposables?: { add: (d: HostDisposable) => void };
}

interface ContributionEnv {
  dispatch?: (name: string, command: string, detail: any) => any;
  commandRegistry?: {
    add: (target: string, name: string, cb: (event: any) => any) => HostDisposable;
  };
  notificationManager?: Record<string, (message: string, options?: any) => void>;
  config?: { set?: (keyPath: string, value: any) => void; settings?: any };
  workspace?: { open?: (uri: string, options?: any) => any };
}

interface ContributionDescriptor {
  kind: string;
  target?: string;
  name?: string;
  level?: string;
  message?: string;
  options?: any;
  keyPath?: string;
  value?: any;
  uri?: string;
}

let ipcRenderer: IpcRendererLike | null = null;
try {
  ipcRenderer = require('electron').ipcRenderer;
} catch (_) {
  ipcRenderer = null;
}

let subscribed = false;
const eventListeners = new Set<(msg: any) => void>();

function available(): boolean {
  return Boolean(ipcRenderer && typeof ipcRenderer.invoke === 'function');
}

function onHostEvent(listener: (msg: any) => void): HostDisposable {
  eventListeners.add(listener);
  return {
    dispose() {
      eventListeners.delete(listener);
    }
  };
}

function handleHostEvent(_event: unknown, msg: any): void {
  for (const listener of eventListeners) {
    try {
      listener(msg);
    } catch (error) {
      console.error('[package-host-client] event listener failed', error);
    }
  }
}

async function ensureSubscribed(): Promise<void> {
  if (!available() || subscribed) return;
  await ipcRenderer!.invoke('chevron:package-host-subscribe');
  ipcRenderer!.on('chevron:package-host-event', handleHostEvent);
  subscribed = true;
}

async function start(): Promise<any> {
  if (!available()) {
    throw new Error('package host IPC is unavailable in this process');
  }
  await ensureSubscribed();
  return ipcRenderer!.invoke('chevron:package-host-start');
}

async function activatePackage({
  name,
  root,
  configSnapshot,
  state
}: {
  name: string;
  root: string;
  configSnapshot?: any;
  state?: any;
}): Promise<any> {
  await start();
  return ipcRenderer!.invoke('chevron:package-host-activate', {
    name,
    root,
    configSnapshot,
    state
  });
}

async function deactivatePackage(name: string): Promise<any> {
  if (!available()) return { name, deactivated: false, reason: 'no-ipc' };
  return ipcRenderer!.invoke('chevron:package-host-deactivate', { name });
}

function dispatch(name: string, command: string, detail: any): Promise<any> {
  if (!available()) return Promise.resolve({ dispatched: false });
  return ipcRenderer!.invoke('chevron:package-host-dispatch', {
    name,
    command,
    detail
  });
}

function notifyConfigChanged(keyPath: string, value: any): Promise<any> {
  if (!available()) return Promise.resolve();
  return ipcRenderer!.invoke('chevron:package-host-config-changed', {
    keyPath,
    value
  });
}

const NOTIFY_METHODS: Record<string, string> = {
  success: 'addSuccess',
  info: 'addInfo',
  warning: 'addWarning',
  error: 'addError',
  fatal: 'addFatalError'
};

/**
 * Apply one host contribution descriptor to the editor environment.
 * `env` is a slice of PackageManager (commands, notifications, config, workspace).
 */
function applyContribution(
  env: ContributionEnv,
  pack: HostPack,
  descriptor: ContributionDescriptor
): any {
  if (!descriptor || !descriptor.kind) return;
  const send = env.dispatch || dispatch;
  switch (descriptor.kind) {
    case 'commands.add': {
      if (!env.commandRegistry || typeof env.commandRegistry.add !== 'function') {
        return;
      }
      const disposable = env.commandRegistry.add(
        descriptor.target,
        descriptor.name,
        event => send(pack.name, descriptor.name, event && event.detail)
      );
      if (pack.activationDisposables && disposable) {
        pack.activationDisposables.add(disposable);
      }
      return disposable;
    }
    case 'commands.remove':
      break;
    case 'notifications.add': {
      if (!env.notificationManager) return;
      const method = NOTIFY_METHODS[descriptor.level] || 'addInfo';
      if (typeof env.notificationManager[method] === 'function') {
        env.notificationManager[method](descriptor.message, descriptor.options);
      }
      break;
    }
    case 'config.set':
      if (env.config && typeof env.config.set === 'function') {
        env.config.set(descriptor.keyPath, descriptor.value);
      }
      break;
    case 'workspace.open':
      if (env.workspace && typeof env.workspace.open === 'function') {
        return env.workspace.open(descriptor.uri, descriptor.options);
      }
      break;
    default:
      break;
  }
}

function configSnapshot(config: ContributionEnv['config'], projectPaths?: string[]): any {
  const settings =
    config && config.settings && typeof config.settings === 'object'
      ? config.settings
      : {};
  const snapshot = JSON.parse(JSON.stringify(settings));
  snapshot.__projectPaths = Array.isArray(projectPaths) ? projectPaths.slice() : [];
  return snapshot;
}

module.exports = {
  available,
  onHostEvent,
  start,
  activatePackage,
  deactivatePackage,
  dispatch,
  notifyConfigChanged,
  applyContribution,
  configSnapshot
};
