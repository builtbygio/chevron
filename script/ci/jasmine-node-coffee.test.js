'use strict';

/**
 * Jasmine runner (#57): jasmine-tagged must load without Coffee transpile.
 * Run: node --test script/ci/jasmine-node-coffee.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('jasmine-node Coffee stand-in', () => {
  it('ships compiled failure-tree.js for the test runner to copy', () => {
    const src = path.join(
      ROOT,
      'spec',
      'support',
      'jasmine-node-failure-tree.js'
    );
    assert.ok(fs.existsSync(src), 'missing spec/support/jasmine-node-failure-tree.js');
    const FailureTree = require(src);
    const tree = new FailureTree();
    assert.strictEqual(typeof tree.add, 'function');
    assert.ok(tree.isEmpty());
  });

  it('copied stand-in is what require("./failure-tree") would resolve', () => {
    const jn = path.dirname(
      require.resolve('jasmine-node', { paths: [ROOT] })
    );
    const dest = path.join(jn, 'failure-tree.js');
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(
        path.join(ROOT, 'spec', 'support', 'jasmine-node-failure-tree.js'),
        dest
      );
    }
    const resolved = require.resolve('./failure-tree', { paths: [jn] });
    assert.ok(resolved.endsWith('.js'), `expected .js, got ${resolved}`);
  });
});
