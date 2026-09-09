'use strict';

/**
 * The module cache written into package.json must not depend on readdir
 * order: the Intel and Apple Silicon builds are merged into one bundle, and
 * the merge refuses two package.json files that differ.
 *
 * Run: node --test script/ci/module-cache-determinism.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// src/module-cache.js needs the app's dependencies (semver, fs-plus); the CI
// unit job does not install them, so this skips there and runs locally.
let sortModuleCache = null;
try {
  ({ sortModuleCache } = require(path.join(ROOT, 'src', 'module-cache')));
} catch (error) {
  sortModuleCache = null;
}

describe('sortModuleCache', () => {
  it('writes the same cache whatever order the files were found in', t => {
    if (!sortModuleCache) return t.skip('app dependencies are not installed');
    const shuffled = {
      version: 1,
      dependencies: [
        { name: 'b', version: '1.0.0', path: 'node_modules/b/index.js' },
        { name: 'a', version: '2.0.0', path: 'node_modules/a/lib/a.js' }
      ],
      extensions: {
        '.node': ['z.node', 'a.node'],
        '.js': ['src/b.js', 'src/a.js']
      },
      folders: [
        { paths: ['src', ''], dependencies: { zed: '^1', alpha: '^2' } },
        { paths: ['node_modules/a'], dependencies: { b: '1' } }
      ]
    };
    const ordered = {
      version: 1,
      dependencies: [
        { name: 'a', version: '2.0.0', path: 'node_modules/a/lib/a.js' },
        { name: 'b', version: '1.0.0', path: 'node_modules/b/index.js' }
      ],
      extensions: {
        '.js': ['src/a.js', 'src/b.js'],
        '.node': ['a.node', 'z.node']
      },
      folders: [
        { paths: ['', 'src'], dependencies: { alpha: '^2', zed: '^1' } },
        { paths: ['node_modules/a'], dependencies: { b: '1' } }
      ]
    };
    assert.equal(
      JSON.stringify(sortModuleCache(shuffled)),
      JSON.stringify(ordered)
    );
    assert.equal(
      JSON.stringify(sortModuleCache(ordered)),
      JSON.stringify(ordered),
      'idempotent'
    );
  });
});
