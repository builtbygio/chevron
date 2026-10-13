'use strict';

/**
 * chevron.lsp.onDidStartServer: when a server can answer, not when its
 * process was asked for.
 *
 * The outline listens for it to replace a fold fallback with symbols. Fired
 * on spawn, as the internal event used to be, a request made in response
 * reaches a server still in its initialize handshake and comes back empty,
 * and the outline stays on folds with nothing to prompt another look.
 *
 * Needs event-kit from the root install, so it runs in the build job.
 * Run: node --test script/ci/lsp-start-event.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const FAKE_ELECTRON = path.join(__dirname, '_fake_electron_lsp.js');

describe('chevron.lsp.onDidStartServer', () => {
  const originalResolve = Module._resolveFilename;
  const listeners = [];
  const seenBeforeActivate = [];
  let lsp;
  let earlySubscription;

  const deliver = msg => {
    for (const listener of listeners) listener({}, msg);
  };

  before(() => {
    require.cache[FAKE_ELECTRON] = {
      id: FAKE_ELECTRON,
      filename: FAKE_ELECTRON,
      loaded: true,
      exports: {
        ipcRenderer: {
          on(channel, listener) {
            if (channel === 'lsp:event') listeners.push(listener);
          },
          removeListener() {},
          invoke: () => Promise.resolve(null)
        }
      }
    };
    Module._resolveFilename = function(request, ...rest) {
      if (request === 'electron') return FAKE_ELECTRON;
      return originalResolve.call(this, request, ...rest);
    };
    lsp = require(path.join(ROOT, 'src', 'lsp'));
    // As a dock item deserialized during workspace load does.
    earlySubscription = lsp.onDidStartServer(event =>
      seenBeforeActivate.push(event)
    );
    lsp.activate();
    lsp._internals.startedSessions.set('ts::/project', {
      serverId: 'ts-1',
      projectRoot: '/project',
      regId: 'ts',
      source: 'builtin',
      positionEncoding: 'utf-16'
    });
  });

  after(() => {
    lsp.deactivate();
    Module._resolveFilename = originalResolve;
    delete require.cache[FAKE_ELECTRON];
  });

  it('fires once initialize has answered, with the session it belongs to', () => {
    const seen = [];
    const subscription = lsp.onDidStartServer(event => seen.push(event));
    deliver({
      type: 'server-initialized',
      serverId: 'ts-1',
      positionEncoding: 'utf-8',
      capabilities: { documentSymbolProvider: true }
    });
    subscription.dispose();
    assert.deepEqual(seen, [
      {
        serverId: 'ts-1',
        projectRoot: '/project',
        regId: 'ts',
        source: 'builtin',
        restarted: false
      }
    ]);
  });

  it('fires again after a crash restart, saying so', () => {
    const seen = [];
    const subscription = lsp.onDidStartServer(event => seen.push(event));
    deliver({
      type: 'server-initialized',
      serverId: 'ts-1',
      positionEncoding: 'utf-16',
      restarted: true
    });
    subscription.dispose();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].restarted, true);
  });

  it('reaches a listener that subscribed before the client activated', () => {
    earlySubscription.dispose();
    assert.equal(seenBeforeActivate.length, 2);
    assert.equal(seenBeforeActivate[0].serverId, 'ts-1');
  });

  it('stays quiet for a server no session knows', () => {
    const seen = [];
    const subscription = lsp.onDidStartServer(event => seen.push(event));
    deliver({
      type: 'server-initialized',
      serverId: 'gone',
      positionEncoding: 'utf-16'
    });
    subscription.dispose();
    assert.deepEqual(seen, []);
  });
});
