'use strict';

/**
 * The tree-view's fs shim has to behave like the fs-plus it replaced, which
 * creates the destination directory for writeFileSync and copySync.
 *
 * docs/reference/tree-view-file-operations.md
 * Run: node --test script/ci/tree-view-fs-shim.test.js
 */

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeTempDir, removeTempDir } = require('../lib/temp-dir');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

function loadShim() {
  const file = path.join(
    ROOT,
    'packages',
    'tree-view',
    'lib',
    'fs-via-main.ts'
  );
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  const localRequire = id =>
    require(id.startsWith('.') ? path.resolve(path.dirname(file), id) : id);
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

function recorder() {
  const calls = [];
  const record = name => (...args) => {
    calls.push({ name, args });
    return true;
  };
  return {
    calls,
    delegate: {
      makeTreeSync: record('makeTreeSync'),
      writeFileSync: record('writeFileSync'),
      copySync: record('copySync'),
      existsSync: record('existsSync')
    }
  };
}

afterEach(() => {
  delete global.chevron;
});

describe('the shim matches what fs-plus actually did', () => {
  it('fs-plus writeFileSync creates the parent directory', () => {
    // Pinned against the library, not against a belief about it.
    const dir = makeTempDir('fs-plus-contract-');
    try {
      const target = path.join(dir, 'made', 'by', 'fs-plus.txt');
      require('fs-plus').writeFileSync(target, 'x');
      assert.ok(fs.existsSync(target));
    } finally {
      removeTempDir(dir);
    }
  });
});

describe('writing a file', () => {
  it('makes the directory it lands in first', () => {
    const { calls, delegate } = recorder();
    global.chevron = { applicationDelegate: delegate };
    loadShim().writeFileSync(path.join(path.sep, 'p', 'new', 'dir', 'f.txt'), '');

    assert.deepEqual(calls.map(c => c.name), ['makeTreeSync', 'writeFileSync']);
    assert.equal(calls[0].args[0], path.join(path.sep, 'p', 'new', 'dir'));
  });

  it('passes the data and encoding through unchanged', () => {
    const { calls, delegate } = recorder();
    global.chevron = { applicationDelegate: delegate };
    loadShim().writeFileSync(path.join(path.sep, 'p', 'f.txt'), 'body', 'utf8');

    const write = calls.find(c => c.name === 'writeFileSync');
    assert.deepEqual(write.args, [path.join(path.sep, 'p', 'f.txt'), 'body', 'utf8']);
  });
});

describe('copying a file', () => {
  it('makes the destination directory first', () => {
    const { calls, delegate } = recorder();
    global.chevron = { applicationDelegate: delegate };
    loadShim().copySync(
      path.join(path.sep, 'p', 'a.txt'),
      path.join(path.sep, 'p', 'new', 'b.txt')
    );

    assert.deepEqual(calls.map(c => c.name), ['makeTreeSync', 'copySync']);
    assert.equal(calls[0].args[0], path.join(path.sep, 'p', 'new'));
  });
});

describe('without a delegate', () => {
  it('says so rather than failing obscurely', () => {
    assert.throws(
      () => loadShim().writeFileSync(path.join(path.sep, 'p', 'f.txt'), ''),
      /applicationDelegate unavailable/
    );
  });
});
