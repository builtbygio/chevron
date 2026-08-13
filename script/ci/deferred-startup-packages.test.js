'use strict';

/**
 * Deferred-startup package list stays a subset of bundled packageDependencies
 * and never includes first-paint shell packages.
 * Run: node --test script/ci/deferred-startup-packages.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const {
  DEFERRED_STARTUP_PACKAGES,
  isDeferredStartupPackage
} = require('../../src/deferred-startup-packages');

const ROOT = path.resolve(__dirname, '..', '..');
const pkg = require(path.join(ROOT, 'package.json'));

const FIRST_PAINT = [
  'tree-view',
  'tabs',
  'status-bar',
  'welcome',
  'notifications',
  'snippets',
  'autocomplete-plus',
  'bracket-matcher',
  'whitespace',
  'wrap-guide',
  'chevron-dark-ui',
  'chevron-dark-syntax'
];

describe('deferred startup packages', () => {
  it('every deferred name is a bundled packageDependency', () => {
    const bundled = new Set(Object.keys(pkg.packageDependencies || {}));
    for (const name of DEFERRED_STARTUP_PACKAGES) {
      assert.ok(bundled.has(name), `${name} is not in packageDependencies`);
    }
  });

  it('does not defer first-paint shell packages', () => {
    for (const name of FIRST_PAINT) {
      assert.equal(
        isDeferredStartupPackage(name),
        false,
        `${name} must stay on the first-paint path`
      );
    }
  });

  it('defers the heavy product packages', () => {
    for (const name of [
      'github',
      'markdown-preview',
      'find-and-replace',
      'settings-view',
      'spell-check',
      'fuzzy-finder'
    ]) {
      assert.ok(isDeferredStartupPackage(name), name);
    }
  });
});
