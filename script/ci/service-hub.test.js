'use strict';

/**
 * The package service registry, vendored from the `service-hub` npm package.
 *
 * That package was decompiled CoffeeScript, last published 2016, declaring
 * event-kit@^1.0.2 and semver@^5.3.0 while being handed the app's 2.5.3 and
 * 7.8.5 -- two of the mismatches packaging's dependency flattening produces.
 * Vendoring removes both: src/service-hub.js uses whatever the app uses, so
 * there is no declared range left to contradict.
 *
 * These assertions were written by running the same scenarios against the npm
 * package and this one and requiring identical results, then kept as the
 * specification. Packages provide and consume services through this, so a
 * semantic drift here is a package silently not receiving a service it asked
 * for -- which is not the kind of failure a smoke test notices.
 *
 * Run: node --test script/ci/service-hub.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const ServiceHub = require(path.resolve(__dirname, '..', '..', 'src', 'service-hub.ts'));

describe('service hub', () => {
  it('delivers to a consumer registered before the provider', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.consume('a.b', '>=1.0.0', v => got.push(v));
    hub.provide('a.b', '1.0.0', 'one');
    assert.deepEqual(got, ['one']);
  });

  it('delivers to a consumer registered after the provider', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('x', '1.0.0', 'val');
    hub.consume('x', '*', v => got.push(v));
    assert.deepEqual(got, ['val']);
  });

  it('gives the highest version within the range, not the first registered', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('svc', { '1.0.0': 'v1', '2.0.0': 'v2', '1.5.0': 'v15' });
    hub.consume('svc', '>=1.0.0', v => got.push(v));
    assert.deepEqual(got, ['v2'], 'versions sort descending and the first match wins');
  });

  it('respects a range that excludes the newest version', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('svc', { '1.0.0': 'v1', '2.0.0': 'v2' });
    hub.consume('svc', '^1.0.0', v => got.push(v));
    assert.deepEqual(got, ['v1']);
  });

  it('calls a consumer once per provider', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('svc', '1.0.0', 'a');
    hub.provide('svc', '1.0.0', 'b');
    hub.consume('svc', '*', v => got.push(v));
    assert.deepEqual(got, ['a', 'b']);
  });

  it('walks a dotted key path', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('deep.nested.key', '1.0.0', 'found');
    hub.consume('deep.nested.key', '*', v => got.push(v));
    assert.deepEqual(got, ['found']);
  });

  it('treats an escaped dot as one segment', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('a\\.b', '1.0.0', 'escaped');
    hub.consume('a\\.b', '*', v => got.push(v));
    assert.deepEqual(got, ['escaped'], '`a\\.b` is one key, not two');
  });

  it('delivers nothing when no version matches', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('svc', '1.0.0', 'v1');
    hub.consume('svc', '^2.0.0', v => got.push(v));
    assert.deepEqual(got, []);
  });

  it('stops delivering once the provider is disposed', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('svc', '1.0.0', 'v1').dispose();
    hub.consume('svc', '*', v => got.push(v));
    assert.deepEqual(got, []);
  });

  it('stops delivering once the consumer is disposed', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.consume('svc', '*', v => got.push(v)).dispose();
    hub.provide('svc', '1.0.0', 'v1');
    assert.deepEqual(got, []);
  });

  it('clear() drops providers and consumers', () => {
    const hub = new ServiceHub();
    const got = [];
    hub.provide('svc', '1.0.0', 'v1');
    hub.clear();
    hub.consume('svc', '*', v => got.push(v));
    assert.deepEqual(got, []);
  });

  it('disposes what a consumer returns when the provider goes', () => {
    const hub = new ServiceHub();
    let disposed = false;
    const provider = hub.provide('svc', '1.0.0', 'v1');
    hub.consume('svc', '*', () => ({ dispose: () => { disposed = true; } }));
    provider.dispose();
    assert.equal(disposed, true, 'a consumer returning a disposable must have it disposed');
  });

  it('is no longer the npm package', () => {
    const pkg = require(path.resolve(__dirname, '..', '..', 'package.json'));
    assert.ok(
      !(pkg.dependencies || {})['service-hub'],
      'service-hub declared event-kit@^1 and semver@^5 and was handed 2.x ' +
        'and 7.x; vendoring is what removed those mismatches'
    );
  });
});
