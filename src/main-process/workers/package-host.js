'use strict';

/**
 * utilityProcess entry: package host v2 (Epic 21, slices 21.1–21.2).
 * Pure Node — no DOM.
 *
 * 21.1 booted the process. 21.2 activates **logic-only** packages here, behind
 * a restricted loader and a stub `chevron` proxy: package code in this process
 * cannot reach privileged Node, native addons, or the real editor API.
 *
 * See docs/security-phase-s-package-host.md "Host v2 (target)".
 *
 * inbound:  { type, requestId?, ... }
 * outbound: { type, requestId?, ... }
 */

const path = require('path');
const fs = require('fs');

const restrictedRequire = require('./package-host-require');
const { createStub } = require('./package-host-stub');

const BOOTED_AT = Date.now();

/** package name -> { root, main, stub, control, module } */
const activePackages = new Map();

restrictedRequire.install();

function post(msg) {
  if (process.parentPort && typeof process.parentPort.postMessage === 'function') {
    process.parentPort.postMessage(msg);
  } else if (typeof process.send === 'function') {
    process.send(msg);
  }
}

function respond(requestId, payload) {
  if (requestId == null) return;
  post(Object.assign({ type: 'response', requestId }, payload));
}

function respondError(requestId, error) {
  if (requestId == null) return;
  post({
    type: 'response',
    requestId,
    error: { message: error && error.message ? error.message : String(error) }
  });
}

/**
 * The host runs T2 (community) package code. It must never hand that code the
 * privileged surface the editor preload has. 21.2 introduces the stub
 * `chevron` proxy; until then we only report what the sandbox looks like so the
 * manager can assert on it.
 */
function describeHost() {
  return {
    pid: process.pid,
    node: process.versions.node,
    electron: process.versions.electron || null,
    // A utilityProcess has no DOM. Asserting this keeps 21.4's hybrid routing
    // honest: anything needing `document` must stay editor-side.
    hasDocument: typeof document !== 'undefined',
    hasWindow: typeof window !== 'undefined',
    uptimeMs: Date.now() - BOOTED_AT,
    packagesLoaded: activePackages.size,
    packages: [...activePackages.keys()]
  };
}

/** Resolve a package's main entry the way Atom's Package.getMainModulePath does. */
function resolveMain(root, metadata) {
  const candidates = [];
  if (metadata && typeof metadata.main === 'string') {
    candidates.push(path.resolve(root, metadata.main));
    candidates.push(path.resolve(root, metadata.main + '.js'));
  }
  candidates.push(path.join(root, 'index.js'));
  candidates.push(path.join(root, 'lib', 'main.js'));
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (_) {
      /* try next */
    }
  }
  throw new Error(`Cannot resolve main module for package at ${root}`);
}

function readMetadata(root) {
  const file = path.join(root, 'package.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function activatePackage({ name, root, configSnapshot, state }) {
  if (!root) throw new Error('activate-package requires a root');
  if (activePackages.has(name)) {
    return { alreadyActive: true, name };
  }

  const metadata = readMetadata(root);
  const packageName = name || metadata.name;
  const emitted = [];

  const control = createStub({
    packageName,
    configSnapshot,
    emit: descriptor => {
      emitted.push(descriptor);
      // Contributions are streamed to the editor as they happen; the editor
      // applies them to the real environment.
      post({ type: 'package-contribution', name: packageName, descriptor });
    }
  });

  const registeredRoot = restrictedRequire.registerPackage(
    root,
    packageName,
    control.stub
  );
  restrictedRequire.purgeModuleCache(registeredRoot);

  let mainModule;
  try {
    mainModule = require(resolveMain(root, metadata));
  } catch (err) {
    restrictedRequire.unregisterPackage(registeredRoot);
    throw err;
  }

  if (mainModule && typeof mainModule.activate === 'function') {
    mainModule.activate(state);
  }

  activePackages.set(packageName, {
    root: registeredRoot,
    stub: control.stub,
    control,
    module: mainModule
  });

  return {
    name: packageName,
    activated: true,
    commands: control.commandNames(),
    contributions: emitted
  };
}

function deactivatePackage({ name }) {
  const entry = activePackages.get(name);
  if (!entry) return { name, deactivated: false, reason: 'not-active' };

  let serialized;
  try {
    if (entry.module && typeof entry.module.serialize === 'function') {
      serialized = entry.module.serialize();
    }
    if (entry.module && typeof entry.module.deactivate === 'function') {
      entry.module.deactivate();
    }
  } finally {
    restrictedRequire.unregisterPackage(entry.root);
    restrictedRequire.purgeModuleCache(entry.root);
    activePackages.delete(name);
  }

  return { name, deactivated: true, state: serialized };
}

function onMessage(raw) {
  const msg = raw && raw.data ? raw.data : raw;
  if (!msg || typeof msg !== 'object') return;
  const { type, requestId } = msg;

  try {
    switch (type) {
      case 'ping':
        respond(requestId, { pong: true, at: Date.now() });
        return;

      case 'describe':
        respond(requestId, { host: describeHost() });
        return;

      case 'activate-package':
        respond(requestId, activatePackage(msg));
        return;

      case 'deactivate-package':
        respond(requestId, deactivatePackage(msg));
        return;

      case 'list-packages':
        respond(requestId, {
          packages: [...activePackages.entries()].map(([name, entry]) => ({
            name,
            root: entry.root,
            commands: entry.control.commandNames()
          }))
        });
        return;

      case 'dispatch-command': {
        const entry = activePackages.get(msg.name);
        if (!entry) {
          respondError(requestId, new Error(`Package not active: ${msg.name}`));
          return;
        }
        respond(requestId, entry.control.dispatchCommand(msg.command, msg.detail));
        return;
      }

      case 'config-changed': {
        for (const [, entry] of activePackages) {
          entry.control.applyConfigChange(msg.keyPath, msg.value);
        }
        respond(requestId, { ok: true });
        return;
      }

      case 'shutdown':
        post({ type: 'host-shutdown' });
        // Let the message flush before the manager kills us.
        setTimeout(() => process.exit(0), 0);
        return;

      default:
        respondError(requestId, new Error(`Unknown package-host message: ${type}`));
    }
  } catch (err) {
    respondError(requestId, err);
  }
}

if (process.parentPort && typeof process.parentPort.on === 'function') {
  process.parentPort.on('message', onMessage);
} else {
  process.on('message', onMessage);
}

post({ type: 'host-booted', pid: process.pid, bootedAt: BOOTED_AT });
