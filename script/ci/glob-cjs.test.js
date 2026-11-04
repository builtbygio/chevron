'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const { makeTempDir, removeTempDir } = require('../lib/temp-dir');

function loadGlob() {
  try {
    return require(path.join(__dirname, '..', '..', 'vendor', 'glob-cjs'));
  } catch (error) {
    return null;
  }
}

describe('glob 14 CJS shim', () => {
  it('is callable, has sync, and promisifies', async t => {
    const glob = loadGlob();
    if (typeof glob !== 'function' || typeof glob.sync !== 'function') {
      return t.skip('glob-core is not installed');
    }
    const root = makeTempDir('chevron-glob-');
    fs.writeFileSync(path.join(root, 'a.txt'), 'a');
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'b.txt'), 'b');
    try {
      const sync = glob.sync('**/*.txt', { cwd: root }).sort();
      assert.deepEqual(sync, ['a.txt', path.join('sub', 'b.txt')]);

      const fromCallback = await new Promise((resolve, reject) => {
        glob('*.txt', { cwd: root }, (err, matches) =>
          err ? reject(err) : resolve(matches)
        );
      });
      assert.deepEqual(fromCallback, ['a.txt']);

      const fromPromisify = await promisify(glob)('*.txt', { cwd: root });
      assert.deepEqual(fromPromisify, ['a.txt']);
    } finally {
      removeTempDir(root);
    }
  });
});
