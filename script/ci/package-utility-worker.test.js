'use strict';

/**
 * Unit tests for Phase S3 utility git workers (no real Electron app).
 * Run: node --test script/ci/package-utility-worker.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');

function mockElectron() {
  const children = [];
  const electron = {
    app: {
      getAppPath: () => ROOT
    },
    utilityProcess: {
      fork(script, args, opts) {
        const handlers = { message: [], exit: [] };
        const child = {
          script,
          args,
          opts,
          killed: false,
          posted: [],
          on(ev, fn) {
            if (handlers[ev]) handlers[ev].push(fn);
            return child;
          },
          postMessage(msg) {
            child.posted.push(msg);
          },
          kill() {
            child.killed = true;
            for (const fn of handlers.exit) fn(0);
          },
          _emitMessage(msg) {
            for (const fn of handlers.message) fn(msg);
          }
        };
        children.push(child);
        return child;
      }
    },
    _children: children
  };
  require.cache[require.resolve('electron')] = {
    id: require.resolve('electron'),
    filename: require.resolve('electron'),
    loaded: true,
    exports: electron
  };
  return electron;
}

describe('package-utility-worker', () => {
  let electron;
  let util;

  before(() => {
    // electron is not installed as a resolvable module in host node — stub resolve
    const orig = Module._resolveFilename;
    Module._resolveFilename = function(request, parent, isMain, options) {
      if (request === 'electron') return path.join(ROOT, 'script/ci/_fake_electron.js');
      return orig.call(this, request, parent, isMain, options);
    };
    // Provide fake electron module path
    const fakePath = path.join(ROOT, 'script/ci/_fake_electron.js');
    electron = mockElectron();
    require.cache[fakePath] = {
      id: fakePath,
      filename: fakePath,
      loaded: true,
      exports: electron
    };
    // Also map 'electron' resolve via cache key used by require('electron')
    const electronResolved = path.join(ROOT, 'script/ci/_fake_electron.js');
    Module._resolveFilename = function(request, parent, isMain, options) {
      if (request === 'electron') return electronResolved;
      return orig.call(this, request, parent, isMain, options);
    };

    delete require.cache[
      require.resolve(path.join(ROOT, 'src/main-process/package-utility-worker.js'))
    ];
    process.env.CHEVRON_GITHUB_UTILITY_WORKERS = '1';
    util = require(path.join(ROOT, 'src/main-process/package-utility-worker.js'));
  });

  after(() => {
    if (util) util._resetForTests();
    delete process.env.CHEVRON_GITHUB_UTILITY_WORKERS;
  });

  it('parseWorkerLoadUrl extracts github worker query', () => {
    const html = path.join(ROOT, 'node_modules/github/lib/renderer.html');
    const url =
      `file://${html}?` +
      'js=%2Ftmp%2Fworker.js&managerWebContentsId=42&operationCountLimit=20&channelName=github%3Arenderer-ipc';
    const parsed = util.parseWorkerLoadUrl(url);
    assert.ok(parsed);
    assert.strictEqual(parsed.managerWebContentsId, 42);
    assert.strictEqual(parsed.operationCountLimit, 20);
    assert.strictEqual(parsed.channelName, 'github:renderer-ipc');
  });

  it('parseWorkerLoadUrl rejects non-file URLs', () => {
    assert.strictEqual(
      util.parseWorkerLoadUrl('https://evil.example/x'),
      null
    );
  });

  it('isEnabled defaults on; respects CHEVRON_GITHUB_UTILITY_WORKERS', () => {
    delete process.env.CHEVRON_GITHUB_UTILITY_WORKERS;
    assert.strictEqual(util.isEnabled(), true);
    process.env.CHEVRON_GITHUB_UTILITY_WORKERS = '0';
    assert.strictEqual(util.isEnabled(), false);
    process.env.CHEVRON_GITHUB_UTILITY_WORKERS = 'false';
    assert.strictEqual(util.isEnabled(), false);
    process.env.CHEVRON_GITHUB_UTILITY_WORKERS = '1';
    assert.strictEqual(util.isEnabled(), true);
  });

  it('createWorker + loadWorkerUrl posts init to child', () => {
    process.env.CHEVRON_GITHUB_UTILITY_WORKERS = '1';
    const sent = [];
    const managerWc = {
      id: 7,
      isDestroyed: () => false,
      send(channel, payload) {
        sent.push({ channel, payload });
      },
      once() {},
      removeListener() {}
    };
    const created = util.createWorker(managerWc);
    assert.ok(created);
    assert.ok(created.id < 0);
    assert.ok(created.webContentsId < 0);

    const html = path.join(ROOT, 'node_modules/github/lib/renderer.html');
    const url =
      `file://${html}?managerWebContentsId=7&operationCountLimit=10&channelName=github%3Arenderer-ipc`;
    assert.strictEqual(util.loadWorkerUrl(created.id, url), true);

    const child = electron._children[electron._children.length - 1];
    assert.ok(child.posted.some(m => m.type === 'init'));
    const init = child.posted.find(m => m.type === 'init');
    assert.strictEqual(init.syntheticWebContentsId, created.webContentsId);
    assert.strictEqual(init.managerWebContentsId, 7);

    // Child → manager forward
    child._emitMessage({
      type: 'renderer-ready',
      sourceWebContentsId: created.webContentsId,
      data: { pid: 123 }
    });
    assert.ok(
      sent.some(
        s =>
          s.channel === 'github:renderer-ipc' &&
          s.payload.type === 'renderer-ready'
      )
    );

    util.destroy(created.id);
    assert.strictEqual(util.isUtilityWorker(created.id), false);
  });

  it('sendToWorker only allows git-exec / git-cancel', () => {
    process.env.CHEVRON_GITHUB_UTILITY_WORKERS = '1';
    const managerWc = {
      id: 9,
      isDestroyed: () => false,
      send() {},
      once() {},
      removeListener() {}
    };
    const created = util.createWorker(managerWc);
    const child = electron._children[electron._children.length - 1];
    assert.strictEqual(
      util.sendToWorker(created.id, 'github:renderer-ipc', {
        type: 'git-exec',
        data: { id: 1, args: ['status'] }
      }),
      true
    );
    assert.strictEqual(
      util.sendToWorker(created.id, 'github:renderer-ipc', {
        type: 'evil',
        data: {}
      }),
      false
    );
    assert.ok(child.posted.some(m => m.type === 'git-exec'));
    util.destroy(created.id);
  });
});

describe('git-utility-host AverageTracker + message shape', () => {
  it('tracks averages', () => {
    const host = require(path.join(
      ROOT,
      'src/main-process/workers/git-utility-host.js'
    ));
    const t = new host.AverageTracker({ limit: 3 });
    t.addValue(10);
    t.addValue(20);
    t.addValue(30);
    assert.strictEqual(t.getAverage(), 20);
    assert.ok(t.enoughData());
  });
});
