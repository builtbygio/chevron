'use strict';

/**
 * @builtbygio/ scope strip for editor package ids.
 * Run: node --test script/ci/package-id.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');

const {
  OWNED_NPM_SCOPE,
  packageIdFromName,
  applyPackageId
} = require('../../src/main-process/package-id');

describe('packageIdFromName', () => {
  it('strips the owned npm scope', () => {
    assert.strictEqual(OWNED_NPM_SCOPE, '@builtbygio/');
    assert.strictEqual(
      packageIdFromName('@builtbygio/tree-view'),
      'tree-view'
    );
    assert.strictEqual(
      packageIdFromName('@builtbygio/language-javascript'),
      'language-javascript'
    );
    assert.strictEqual(packageIdFromName('@builtbygio/watcher'), 'watcher');
  });

  it('leaves unscoped and @atom/ names alone', () => {
    assert.strictEqual(packageIdFromName('tree-view'), 'tree-view');
    assert.strictEqual(packageIdFromName('@atom/watcher'), '@atom/watcher');
    assert.strictEqual(packageIdFromName('@atom/fuzzy-native'), '@atom/fuzzy-native');
  });

  it('does not strip other scopes', () => {
    assert.strictEqual(packageIdFromName('@chevron/tree-view'), '@chevron/tree-view');
    assert.strictEqual(packageIdFromName('@giobuilds/tree-view'), '@giobuilds/tree-view');
  });

  it('passes through empty / non-string', () => {
    assert.strictEqual(packageIdFromName(''), '');
    assert.strictEqual(packageIdFromName(null), null);
    assert.strictEqual(packageIdFromName(undefined), undefined);
  });
});

describe('applyPackageId', () => {
  it('rewrites metadata.name and keeps publishName', () => {
    const metadata = { name: '@builtbygio/whitespace', version: '0.37.10' };
    const id = applyPackageId(metadata);
    assert.strictEqual(id, 'whitespace');
    assert.strictEqual(metadata.name, 'whitespace');
    assert.strictEqual(metadata.publishName, '@builtbygio/whitespace');
  });

  it('is a no-op when already unscoped', () => {
    const metadata = { name: 'about' };
    applyPackageId(metadata);
    assert.strictEqual(metadata.name, 'about');
    assert.strictEqual(metadata.publishName, undefined);
  });

  it('falls back when name is missing', () => {
    const metadata = {};
    const id = applyPackageId(metadata, 'from-folder');
    assert.strictEqual(id, 'from-folder');
    assert.strictEqual(metadata.name, 'from-folder');
  });
});

describe('package-id module lives in main-process (plain JS)', () => {
  it('is loadable without compile-cache', () => {
    const abs = path.join(
      __dirname,
      '../../src/main-process/package-id.js'
    );
    delete require.cache[require.resolve(abs)];
    const again = require(abs);
    assert.strictEqual(typeof again.packageIdFromName, 'function');
  });
});
