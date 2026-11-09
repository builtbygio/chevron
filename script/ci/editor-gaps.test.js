'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

function loadTs(relative) {
  const file = path.join(ROOT, relative);
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    require
  );
  return module.exports;
}

const { serializeWorkspace, parseWorkspace } = loadTs('src/workspace-file.ts');
const { snapshot, listSnapshots, readSnapshot } = loadTs('src/local-history.ts');

describe('saved workspaces', () => {
  it('round-trips the folder list', () => {
    const text = serializeWorkspace(['/src/a', '/src/b']);
    assert.deepStrictEqual(parseWorkspace(text).folders, ['/src/a', '/src/b']);
  });

  it('rejects a file with no folders', () => {
    assert.throws(() => parseWorkspace('{"folders":[]}'), /no folders/);
  });
});

describe('local file history', () => {
  it('keeps an earlier copy that differs from the latest save', () => {
    const home = makeTempDir('chevron-history-');
    const file = path.join(home, 'note.txt');
    snapshot(home, file, 'one');
    snapshot(home, file, 'two');
    const copies = listSnapshots(home, file).map(readSnapshot);
    assert.deepStrictEqual(copies[0], 'two');
    assert.ok(copies.includes('one'));
  });
});
