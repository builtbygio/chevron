'use strict';

/**
 * Project search keeps ripgrep output that reaches the renderer before the
 * start reply does.
 *
 * The renderer used to learn the search id from the `chevron:rg-search-start`
 * reply and only then listen for `chevron:rg-search-data`. The reply and main's
 * sends are not ordered with each other, so on a fast search the data could
 * arrive first and be dropped, while the close arrived after and resolved the
 * search: zero results, no error. The renderer now picks the id and listens
 * before it asks main to start.
 *
 * Run: node --test script/ci/rg-search-ordering.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const Module = require('module');
const { EventEmitter } = require('events');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const RipgrepDirectorySearcher = require(path.join(ROOT, 'src', 'ripgrep-directory-searcher'));
const { createRgSearchManager } = require(path.join(ROOT, 'src', 'main-process', 'register-rg-ipc'));

const DIR = path.resolve('/repo');

function rgOutput() {
  const p = { text: 'a.txt' };
  return [
    { type: 'begin', data: { path: p } },
    {
      type: 'match',
      data: {
        path: p,
        lines: { text: 'hello world\n' },
        line_number: 1,
        absolute_offset: 0,
        submatches: [{ match: { text: 'world' }, start: 6, end: 11 }]
      }
    },
    { type: 'end', data: { path: p } }
  ].map(m => JSON.stringify(m) + '\n').join('');
}

// Output, then the start reply, then close: the order that lost results.
function earlyOutputIpc() {
  const ipc = new EventEmitter();
  ipc.invoke = (channel, payload) => {
    if (channel !== 'chevron:rg-search-start') return Promise.resolve({ ok: true });
    const { searchId } = payload;
    ipc.emit('chevron:rg-search-data', {}, { searchId, chunk: rgOutput() });
    setTimeout(() => ipc.emit('chevron:rg-search-close', {}, { searchId, code: 0 }), 5);
    return Promise.resolve({ searchId });
  };
  return ipc;
}

function withElectron(ipcRenderer, fn) {
  const load = Module._load;
  Module._load = function(request, ...rest) {
    if (request === 'electron') return { ipcRenderer };
    return load.call(this, request, ...rest);
  };
  return Promise.resolve().then(fn).finally(() => {
    Module._load = load;
  });
}

describe('ripgrep search ordering', () => {
  it('keeps matches sent before the start reply', async () => {
    const results = [];
    const searcher = new RipgrepDirectorySearcher();
    // Main resolves the binary; this job has no @vscode/ripgrep installed.
    searcher.rgPath = '/bin/rg';
    await withElectron(earlyOutputIpc(), () =>
      searcher.search([{ getPath: () => DIR }], /world/g, {
        inclusions: [],
        exclusions: [],
        didMatch: r => results.push(r),
        didSearchPaths: () => {},
        didError: () => {}
      })
    );
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].filePath, path.join(DIR, 'a.txt'));
    assert.strictEqual(results[0].matches[0].matchText, 'world');
  });
});

describe('createRgSearchManager search ids', () => {
  const deps = () => ({
    spawn: () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => child.emit('close', null, 'SIGTERM');
      return child;
    },
    resolveRgPath: () => '/bin/rg',
    existsSync: () => true,
    isDirectory: () => true
  });
  const sender = { isDestroyed: () => false, send() {} };
  const args = ['--json', '--regexp', 'x', '.'];
  const cwd = path.resolve('/tmp');

  it('uses the id the renderer chose', () => {
    const manager = createRgSearchManager(deps());
    const { searchId } = manager.start({ args, cwd, sender, searchId: 'abc-123' });
    assert.strictEqual(searchId, 'abc-123');
    assert.strictEqual(manager.cancel('abc-123', sender).ok, true);
  });

  it('rejects a malformed or in-use id', () => {
    const manager = createRgSearchManager(deps());
    manager.start({ args, cwd, sender, searchId: 'same' });
    assert.throws(() => manager.start({ args, cwd, sender, searchId: 'same' }), { code: 'RG_ID_REJECTED' });
    assert.throws(() => manager.start({ args, cwd, sender, searchId: 7 }), { code: 'RG_ID_REJECTED' });
    assert.throws(() => manager.start({ args, cwd, sender, searchId: '../x' }), { code: 'RG_ID_REJECTED' });
  });
});
