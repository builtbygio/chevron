'use strict';

/**
 * Service plumbing for package host v2 (Epic 21, slice 21.3).
 *
 * Chevron packages exchange capabilities through `providedServices` /
 * `consumedServices` in package.json plus a named method on the main module
 * (the Atom service-hub model, which Pillar 7 keeps). Across a process
 * boundary a service object cannot be cloned, so it travels as a
 * **descriptor** — name, version, method names — and each side builds a proxy
 * that turns method calls into RPC.
 */

/** Parse "1.2.3" into [1, 2, 3]; missing parts read as 0. */
function parseVersion(value) {
  const parts = String(value == null ? '' : value)
    .trim()
    .replace(/^[v=]+/, '')
    .split('-')[0]
    .split('.');
  return [0, 1, 2].map(i => {
    const n = parseInt(parts[i], 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function compareVersion(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (va[i] > vb[i]) return 1;
    if (va[i] < vb[i]) return -1;
  }
  return 0;
}

/**
 * Minimal semver range check.
 *
 * Deliberately not the `semver` package. The host is exercised by
 * `script/ci` on bare Node, and CI's unit-and-cpm job never runs a root
 * `npm ci`, so the app's node_modules is not on disk there. This covers the
 * forms owned packages actually use in `consumedServices`.
 */
function satisfies(version, range) {
  const r = String(range == null ? '*' : range).trim();
  if (r === '' || r === '*' || r === 'x') return true;

  if (r.startsWith('^')) {
    const base = r.slice(1);
    if (compareVersion(version, base) < 0) return false;
    return parseVersion(version)[0] === parseVersion(base)[0];
  }
  if (r.startsWith('~')) {
    const base = r.slice(1);
    if (compareVersion(version, base) < 0) return false;
    const v = parseVersion(version);
    const b = parseVersion(base);
    return v[0] === b[0] && v[1] === b[1];
  }
  if (r.startsWith('>=')) return compareVersion(version, r.slice(2)) >= 0;
  if (r.startsWith('>')) return compareVersion(version, r.slice(1)) > 0;
  if (r.startsWith('<=')) return compareVersion(version, r.slice(2)) <= 0;
  if (r.startsWith('<')) return compareVersion(version, r.slice(1)) < 0;

  return compareVersion(version, r.replace(/^=/, '')) === 0;
}

/**
 * @returns {Array<{name: string, version: string, methodName: string}>}
 */
function parseProvidedServices(metadata) {
  const out = [];
  const provided = (metadata && metadata.providedServices) || {};
  for (const [name, spec] of Object.entries(provided)) {
    const versions = (spec && spec.versions) || {};
    for (const [version, methodName] of Object.entries(versions)) {
      if (typeof methodName === 'string') out.push({ name, version, methodName });
    }
  }
  return out;
}

/**
 * @returns {Array<{name: string, range: string, methodName: string}>}
 */
function parseConsumedServices(metadata) {
  const out = [];
  const consumed = (metadata && metadata.consumedServices) || {};
  for (const [name, spec] of Object.entries(consumed)) {
    const versions = (spec && spec.versions) || {};
    for (const [range, methodName] of Object.entries(versions)) {
      if (typeof methodName === 'string') out.push({ name, range, methodName });
    }
  }
  return out;
}

/**
 * Enumerate the callable surface of a service object, including prototype
 * methods (packages commonly return class instances).
 */
function describeService(service) {
  const methods = new Set();
  if (!service || (typeof service !== 'object' && typeof service !== 'function')) {
    return [];
  }
  let cursor = service;
  while (cursor && cursor !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(cursor)) {
      if (key === 'constructor') continue;
      let value;
      try {
        value = service[key];
      } catch (_) {
        continue;
      }
      if (typeof value === 'function') methods.add(key);
    }
    cursor = Object.getPrototypeOf(cursor);
  }
  return [...methods];
}

/** Build a proxy object whose methods forward to `invoke(method, args)`. */
function buildServiceProxy(methods, invoke) {
  const proxy = {};
  for (const method of methods || []) {
    proxy[method] = (...args) => invoke(method, args);
  }
  return proxy;
}

function serviceKey(name, version) {
  return `${name}@${version}`;
}

module.exports = {
  satisfies,
  compareVersion,
  parseProvidedServices,
  parseConsumedServices,
  describeService,
  buildServiceProxy,
  serviceKey
};
