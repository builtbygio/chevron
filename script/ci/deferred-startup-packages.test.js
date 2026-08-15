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
  SNAPSHOT_STARTUP_PACKAGES,
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
  'settings-view',
  'lsp-ui',
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
      'spell-check',
      'fuzzy-finder',
      'autocomplete-plus',
      'snippets',
      'bracket-matcher'
    ]) {
      assert.ok(isDeferredStartupPackage(name), name);
    }
  });

  it('snapshot startup packages are first-paint and statically required', () => {
    const init = require('fs').readFileSync(
      path.join(ROOT, 'src/initialize-application-window.js'),
      'utf8'
    );
    assert.ok(SNAPSHOT_STARTUP_PACKAGES.length > 5);
    for (const name of SNAPSHOT_STARTUP_PACKAGES) {
      assert.equal(
        isDeferredStartupPackage(name),
        false,
        `${name} cannot be both snapshotted and deferred`
      );
      assert.ok(
        init.includes(`require('${name}')`),
        `initialize-application-window.js must statically require ${name}`
      );
    }
    assert.ok(
      /if\s*\(\s*!global\.isGeneratingSnapshot\s*\)/.test(init),
      'must skip AtomEnvironment construction during snapshot generation'
    );
    assert.ok(
      init.includes('function installEnvironment'),
      'must construct AtomEnvironment at runtime via installEnvironment'
    );
  });

  it('does not defer language-* (grammars must exist before the first editor)', () => {
    const langs = Object.keys(pkg.packageDependencies || {}).filter(n =>
      n.startsWith('language-')
    );
    assert.ok(langs.length > 10, 'expected bundled language-* packages');
    for (const name of langs) {
      assert.equal(
        isDeferredStartupPackage(name),
        false,
        `${name} must activate with first paint so .c/.js files get a grammar`
      );
    }
  });
});
