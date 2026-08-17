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
const services = require('./package-host-services');

const BOOTED_AT = Date.now();

/** package name -> { root, main, stub, control, module } */
const activePackages = new Map();

/** "name@version" -> { name, version, packageName, service, methods } */
const hostProvidedServices = new Map();

/** name -> Array<{ name, version, methods }> offered by the editor side */
const editorServices = new Map();

restrictedRequire.install();

// --- reverse RPC: host -> editor ------------------------------------------
// Needed so a host package consuming an *editor-side* service can call it.
let nextHostRequestId = 1;
const pendingHostRequests = new Map();

function hostRequest(payload, timeoutMs = 15000) {
  const hostRequestId = nextHostRequestId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingHostRequests.delete(hostRequestId);
      reject(new Error(`Host request timeout (${payload.type})`));
    }, timeoutMs);
    pendingHostRequests.set(hostRequestId, {
      resolve: v => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: e => {
        clearTimeout(timer);
        reject(e);
      }
    });
    // Envelope fields last: the payload carries its own `type`, which would
    // otherwise clobber the `host-request` label the manager dispatches on.
    post(
      Object.assign({}, payload, {
        type: 'host-request',
        subtype: payload.type,
        hostRequestId
      })
    );
  });
}

/** Register whatever this package declares in providedServices. */
function registerProvidedServices(packageName, metadata, mainModule) {
  const descriptors = [];
  for (const entry of services.parseProvidedServices(metadata)) {
    const method = mainModule && mainModule[entry.methodName];
    if (typeof method !== 'function') continue;
    const service = method.call(mainModule);
    const methods = services.describeService(service);
    const key = services.serviceKey(entry.name, entry.version);
    hostProvidedServices.set(key, {
      name: entry.name,
      version: entry.version,
      packageName,
      service,
      methods
    });
    descriptors.push({ name: entry.name, version: entry.version, methods });
  }
  return descriptors;
}

/**
 * Hand this package every already-known editor-side service that matches one
 * of its consumedServices ranges.
 */
function applyConsumedServices(packageName, metadata, mainModule, wired) {
  const consumed = [];
  for (const entry of services.parseConsumedServices(metadata)) {
    const offers = editorServices.get(entry.name) || [];
    for (const offer of offers) {
      if (!services.satisfies(offer.version, entry.range)) continue;
      const key = services.serviceKey(offer.name, offer.version);
      // A service offered after activation must reach existing consumers, but
      // each consumer method may only be called once per service version.
      if (wired && wired.has(key)) continue;
      const method = mainModule && mainModule[entry.methodName];
      if (typeof method !== 'function') continue;
      if (wired) wired.add(key);
      const proxy = services.buildServiceProxy(offer.methods, (m, args) =>
        hostRequest({
          type: 'call-editor-service',
          name: offer.name,
          version: offer.version,
          method: m,
          args
        }).then(res => res.result)
      );
      method.call(mainModule, proxy);
      consumed.push({ name: offer.name, version: offer.version });
    }
  }
  return consumed;
}

function unregisterServicesFor(packageName) {
  for (const [key, entry] of [...hostProvidedServices]) {
    if (entry.packageName === packageName) hostProvidedServices.delete(key);
  }
}

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

  // Services are registered after activate(), matching the in-process order.
  const provided = registerProvidedServices(packageName, metadata, mainModule);
  const wiredServices = new Set();
  const consumed = applyConsumedServices(
    packageName,
    metadata,
    mainModule,
    wiredServices
  );

  activePackages.set(packageName, {
    root: registeredRoot,
    stub: control.stub,
    control,
    module: mainModule,
    metadata,
    wiredServices
  });

  return {
    name: packageName,
    activated: true,
    commands: control.commandNames(),
    contributions: emitted,
    providedServices: provided,
    consumedServices: consumed
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
    unregisterServicesFor(name);
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

      case 'host-response': {
        const p = pendingHostRequests.get(msg.hostRequestId);
        if (!p) return;
        pendingHostRequests.delete(msg.hostRequestId);
        if (msg.error) p.reject(new Error(msg.error.message || String(msg.error)));
        else p.resolve(msg);
        return;
      }

      case 'list-services':
        respond(requestId, {
          services: [...hostProvidedServices.values()].map(s => ({
            name: s.name,
            version: s.version,
            packageName: s.packageName,
            methods: s.methods
          }))
        });
        return;

      case 'call-service': {
        // The editor calling a service a host package provides.
        const entry = hostProvidedServices.get(
          services.serviceKey(msg.name, msg.version)
        );
        if (!entry) {
          respondError(
            requestId,
            new Error(`No such host service: ${msg.name}@${msg.version}`)
          );
          return;
        }
        const fn = entry.service && entry.service[msg.method];
        if (typeof fn !== 'function') {
          respondError(
            requestId,
            new Error(`Service ${msg.name}@${msg.version} has no method ${msg.method}`)
          );
          return;
        }
        Promise.resolve(fn.apply(entry.service, msg.args || []))
          .then(result => respond(requestId, { result }))
          .catch(err => respondError(requestId, err));
        return;
      }

      case 'offer-editor-service': {
        // The editor advertising one of its services to host packages.
        const { name, version, methods } = msg;
        if (!editorServices.has(name)) editorServices.set(name, []);
        const offers = editorServices.get(name);
        if (!offers.some(o => o.version === version)) {
          offers.push({ name, version, methods: methods || [] });
        }
        // Late-arriving services still reach already-active consumers.
        const wired = [];
        for (const [packageName, entry] of activePackages) {
          const consumed = applyConsumedServices(
            packageName,
            entry.metadata,
            entry.module,
            entry.wiredServices
          );
          if (consumed.length) wired.push({ packageName, consumed });
        }
        respond(requestId, { ok: true, wired });
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
