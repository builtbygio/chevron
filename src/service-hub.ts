'use strict';

/**
 * The package service registry.
 *
 * Replaces the `service-hub` npm package, which was decompiled CoffeeScript
 * last published in 2016. It declared `event-kit@^1.0.2` and `semver@^5.3.0`
 * and was handed the app's 2.5.3 and 7.8.5 -- two of the version mismatches
 * that packaging's dependency flattening produces. Vendoring it removes both:
 * this file uses whatever the app uses, so there is no declared range left to
 * contradict.
 *
 * Behaviour is unchanged and deliberately so. Packages provide and consume
 * services through this, so a semantic difference here is a package silently
 * not receiving a service it asked for.
 *
 * Semantics worth stating, because they are not obvious from the API:
 *
 *   - A provider registers one or more versions of a service at a key path.
 *   - A consumer asks for a key path and a semver range, and is called with
 *     the *highest* matching version a provider offers -- versions are sorted
 *     descending and the first match wins, so a provider offering 1.0.0 and
 *     2.0.0 to a consumer accepting `>=1` delivers 2.0.0.
 *   - A consumer is called once per provider, not once per matching version.
 *   - Key paths are dot-separated, and a dot may be escaped with a backslash:
 *     `a.b` is two segments, `a\.b` is one.
 */

const { Disposable, CompositeDisposable } = require('event-kit');
const { SemVer, Range } = require('semver');

// `a.b.c` -> ['a', 'b', 'c'], with `\.` escaping a literal dot.
function splitKeyPath(keyPath) {
  if (keyPath == null) return [];
  const keys = [];
  let startIndex = 0;
  for (let i = 0; i < keyPath.length; i++) {
    if (keyPath[i] === '.' && (i === 0 || keyPath[i - 1] !== '\\')) {
      keys.push(keyPath.substring(startIndex, i));
      startIndex = i + 1;
    }
  }
  keys.push(keyPath.slice(startIndex));
  return keys;
}

function getValueAtKeyPath(object, keyPath) {
  let value = object;
  for (const key of splitKeyPath(keyPath)) {
    value = value[key];
    if (value == null) return undefined;
  }
  return value;
}

function setValueAtKeyPath(object, keyPath, value) {
  const keys = splitKeyPath(keyPath);
  let target = object;
  while (keys.length > 1) {
    const key = keys.shift();
    if (target[key] == null) target[key] = {};
    target = target[key];
  }
  target[keys.shift()] = value;
  return value;
}

class Consumer {
  constructor(keyPath, versionRange, callback) {
    this.keyPath = keyPath;
    this.callback = callback;
    this.versionRange = new Range(versionRange);
  }
}

class Provider {
  constructor(keyPath, servicesByVersion) {
    this.consumersDisposable = new CompositeDisposable();
    this.servicesByVersion = {};
    this.versions = [];
    for (const version of Object.keys(servicesByVersion)) {
      this.servicesByVersion[version] = {};
      this.versions.push(new SemVer(version));
      setValueAtKeyPath(
        this.servicesByVersion[version],
        keyPath,
        servicesByVersion[version]
      );
    }
    // Highest first: the first match wins, so a consumer gets the newest
    // version the provider offers within its range.
    this.versions.sort((a, b) => b.compare(a));
  }

  provide(consumer) {
    for (const version of this.versions) {
      if (!consumer.versionRange.test(version)) continue;
      const value = getValueAtKeyPath(
        this.servicesByVersion[version.toString()],
        consumer.keyPath
      );
      if (!value) continue;
      const consumerDisposable = consumer.callback.call(null, value);
      if (
        consumerDisposable != null &&
        typeof consumerDisposable.dispose === 'function'
      ) {
        this.consumersDisposable.add(consumerDisposable);
      }
      return;
    }
  }

  destroy() {
    this.consumersDisposable.dispose();
  }
}

class ServiceHub {
  constructor() {
    this.consumers = [];
    this.providers = [];
  }

  // provide(keyPath, version, service) or provide(keyPath, servicesByVersion)
  provide(keyPath, version, service) {
    const servicesByVersion =
      service != null ? { [version]: service } : version;
    const provider = new Provider(keyPath, servicesByVersion);
    this.providers.push(provider);

    // Iterate a copy: a consumer's callback may register more consumers.
    for (const consumer of this.consumers.slice()) {
      if (!consumer.isDestroyed) provider.provide(consumer);
    }

    return new Disposable(() => {
      provider.destroy();
      const index = this.providers.indexOf(provider);
      if (index >= 0) this.providers.splice(index, 1);
    });
  }

  consume(keyPath, versionRange, callback) {
    const consumer = new Consumer(keyPath, versionRange, callback);
    this.consumers.push(consumer);
    for (const provider of this.providers.slice()) {
      provider.provide(consumer);
    }
    return new Disposable(() => {
      const index = this.consumers.indexOf(consumer);
      if (index >= 0) this.consumers.splice(index, 1);
    });
  }

  clear() {
    for (const provider of this.providers.slice()) provider.destroy();
    this.providers = [];
    this.consumers = [];
  }
}

module.exports = ServiceHub;
