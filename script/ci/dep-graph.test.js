'use strict';

/**
 * Stream E: dependency graph guards.
 * Run: node --test script/ci/dep-graph.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const {
  classifySpec,
  summarizeDependencies,
  FORBIDDEN_APP_DEPS
} = require('../lib/dep-graph');
const {
  DECAFFEINATE_PACKAGES,
  DEBABEL_PACKAGES,
  SAFETY_NET_PATCHES
} = require('../lib/patch-bridge-inventory');

describe('classifySpec', () => {
  it('classifies file / git / semver', () => {
    assert.strictEqual(classifySpec('file:packages/about'), 'file');
    assert.strictEqual(
      classifySpec('git+https://github.com/atom/foo.git#abc'),
      'git-atom'
    );
    assert.strictEqual(
      classifySpec('git+https://github.com/builtbygio/foo.git#abc'),
      'git-builtbygio'
    );
    assert.strictEqual(classifySpec('1.2.3'), 'semver');
    assert.strictEqual(classifySpec('^4.0.0'), 'semver');
  });
});

describe('root dependency graph', () => {
  const { counts, lists } = summarizeDependencies(pkg);

  it('does not depend on forbidden compile-cache runtimes', () => {
    for (const name of FORBIDDEN_APP_DEPS) {
      assert.ok(!pkg.dependencies[name], `unexpected app dep ${name}`);
    }
  });

  it('overrides nan to 2.28.0 (Stream B / keytar)', () => {
    assert.ok(pkg.overrides, 'package.json overrides missing');
    assert.strictEqual(pkg.overrides.nan, '2.28.0');
  });

  it('overrides runtime SCA hotspots (marked / DOMPurify / dugite tar)', () => {
    assert.strictEqual(pkg.overrides.dompurify, '3.4.13');
    assert.strictEqual(pkg.overrides.marked, '4.3.0');
    assert.ok(pkg.overrides.dugite, 'dugite override missing');
    assert.strictEqual(pkg.overrides.dugite.tar, '6.2.1');
  });

  it('keeps atom/* git pin count from growing past known ceiling', () => {
    // #79: language-* still on atom/*. Ceiling is current + 0 slack for new pins.
    // If this fails, either fork the package (preferred) or raise the ceiling
    // with an issue comment — do not silently add atom/* pins.
    const CEILING = 22;
    assert.ok(
      counts['git-atom'] <= CEILING,
      `atom/* git pins ${counts['git-atom']} > ceiling ${CEILING}: ${lists['git-atom'].join(', ')}`
    );
  });

  it('reports a non-zero owned-pin set', () => {
    assert.ok(counts['git-builtbygio'] >= 20);
  });

  it('install policy still documents legacy-peer-deps', () => {
    const install = fs.readFileSync(
      path.join(ROOT, 'script', 'lib', 'install-app-dependencies.js'),
      'utf8'
    );
    assert.ok(install.includes('legacyPeerDeps'));
  });
});

describe('Class C patch bridges (retired)', () => {
  it('decaffeinate / debabel sets are empty (folded into owned pins)', () => {
    assert.deepStrictEqual(DECAFFEINATE_PACKAGES, []);
    assert.deepStrictEqual(DEBABEL_PACKAGES, []);
  });

  it('offline Class C patch trees and scripts are gone', () => {
    const gone = [
      'script/lib/patch-decaffeinate-bundled-packages.js',
      'script/lib/patch-debabel-bundled-packages.js',
      'script/lib/patch-tree-view-stats.js',
      'script/lib/patch-natives-context-aware.js',
      'script/lib/patch-v8-api.js',
      'script/lib/patch-oniguruma-gyp.js',
      'script/lib/patch-spellchecker-win.js',
      'script/lib/patch-keytar-nan.js',
      'script/patches/decaffeinated-bundled-packages',
      'script/patches/debabelled-bundled-packages'
    ];
    for (const rel of gone) {
      assert.ok(
        !fs.existsSync(path.join(ROOT, rel)),
        `Class C leftover still present: ${rel}`
      );
    }
  });

  it('safety-net patch files exist', () => {
    for (const name of SAFETY_NET_PATCHES) {
      const p = path.join(ROOT, 'script', 'lib', name);
      assert.ok(fs.existsSync(p), `missing ${name}`);
    }
  });
});
