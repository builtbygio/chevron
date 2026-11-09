'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { serializeWorkspace, parseWorkspace } = require('../../src/workspace-file');
const { snapshot, listSnapshots, readSnapshot } = require('../../src/local-history');

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
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'chevron-history-'));
    const file = path.join(home, 'note.txt');
    snapshot(home, file, 'one');
    snapshot(home, file, 'two');
    const copies = listSnapshots(home, file).map(readSnapshot);
    assert.deepStrictEqual(copies[0], 'two');
    assert.ok(copies.includes('one'));
  });
});
