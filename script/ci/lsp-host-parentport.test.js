'use strict';

/**
 * The LSP host reads messages the way utilityProcess delivers them.
 *
 * `utilityProcess` emits a MessageEvent on `process.parentPort`, so a listener
 * that treats the event as the message sees `type === 'message'` and matches
 * no branch. The host still posted `host-booted`, so the manager thought it
 * had a live host: `startServer` is fire-and-forget, the renderer recorded a
 * session, and every request after that died on `LSP host request timeout`
 * with no server process ever spawned. No language server could start in a
 * packaged window.
 *
 * The fork-based host test could not see it -- `child_process.fork` delivers
 * the raw message -- so this drives both shapes.
 *
 * Run: node --test script/ci/lsp-host-parentport.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const { EventEmitter } = require('events');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src', 'main-process', 'workers', 'lsp-host.js');

const posted = [];
let parentPort;
let originalParentPort;

before(() => {
  parentPort = new EventEmitter();
  parentPort.postMessage = msg => posted.push(msg);
  originalParentPort = process.parentPort;
  Object.defineProperty(process, 'parentPort', {
    value: parentPort,
    configurable: true,
    writable: true
  });
  delete require.cache[HOST];
  require(HOST);
});

after(() => {
  Object.defineProperty(process, 'parentPort', {
    value: originalParentPort,
    configurable: true,
    writable: true
  });
  delete require.cache[HOST];
});

const pongs = () => posted.filter(m => m && m.type === 'pong');

describe('lsp host on parentPort', () => {
  it('announces itself', () => {
    assert.ok(
      posted.some(m => m && m.type === 'host-booted'),
      'the host must post host-booted, which is what makes an unread inbox ' +
        'look like a healthy host'
    );
  });

  it('answers a message delivered as a MessageEvent', async () => {
    const before = pongs().length;
    parentPort.emit('message', { data: { type: 'ping' } });
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(
      pongs().length,
      before + 1,
      'utilityProcess wraps the message in an event; unwrap it or the host ' +
        'silently ignores everything the main process sends'
    );
  });

  it('still answers a raw message, as fork delivers it', async () => {
    const before = pongs().length;
    parentPort.emit('message', { type: 'ping' });
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(pongs().length, before + 1);
  });
});
