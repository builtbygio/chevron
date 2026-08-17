'use strict';

/**
 * Epic 21 slice 21.1 — package host bootstrap.
 * Run: node --test script/ci/package-host-bootstrap.test.js
 *
 * Forks workers/package-host.js as a plain child_process (no Electron) and
 * exercises the control protocol the main-process manager speaks.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src/main-process/workers/package-host.js');
const MANAGER = path.join(ROOT, 'src/main-process/package-host-manager.js');

function forkHost() {
  const child = fork(HOST, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const inbox = [];
  const waiters = [];
  child.on('message', msg => {
    const waiter = waiters.findIndex(w => w.match(msg));
    if (waiter !== -1) {
      const [w] = waiters.splice(waiter, 1);
      w.resolve(msg);
    } else {
      inbox.push(msg);
    }
  });
  return {
    child,
    send: msg => child.send(msg),
    waitFor(match, timeoutMs = 5000) {
      const hit = inbox.findIndex(match);
      if (hit !== -1) return Promise.resolve(inbox.splice(hit, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('timeout waiting for host message')),
          timeoutMs
        );
        waiters.push({
          match,
          resolve: v => {
            clearTimeout(timer);
            resolve(v);
          }
        });
      });
    },
    kill: () => child.kill()
  };
}

describe('package host v2 — bootstrap (21.1)', () => {
  let host;

  before(async () => {
    host = forkHost();
    await host.waitFor(m => m.type === 'host-booted');
  });

  after(() => {
    if (host) host.kill();
  });

  it('announces host-booted with a pid', async () => {
    const h = forkHost();
    const booted = await h.waitFor(m => m.type === 'host-booted');
    assert.strictEqual(typeof booted.pid, 'number');
    assert.ok(booted.pid > 0);
    assert.strictEqual(typeof booted.bootedAt, 'number');
    h.kill();
  });

  it('answers ping with a correlated response', async () => {
    host.send({ type: 'ping', requestId: 42 });
    const res = await host.waitFor(m => m.type === 'response' && m.requestId === 42);
    assert.strictEqual(res.pong, true);
    assert.strictEqual(typeof res.at, 'number');
  });

  it('correlates concurrent requests by requestId', async () => {
    host.send({ type: 'ping', requestId: 101 });
    host.send({ type: 'describe', requestId: 102 });
    const [a, b] = await Promise.all([
      host.waitFor(m => m.type === 'response' && m.requestId === 101),
      host.waitFor(m => m.type === 'response' && m.requestId === 102)
    ]);
    assert.strictEqual(a.pong, true);
    assert.ok(b.host);
  });

  it('reports a DOM-free Node sandbox', async () => {
    host.send({ type: 'describe', requestId: 7 });
    const res = await host.waitFor(m => m.type === 'response' && m.requestId === 7);
    // This is the property 21.4 hybrid routing depends on: no DOM in the host,
    // so any package touching `document` must stay editor-side.
    assert.strictEqual(res.host.hasDocument, false);
    assert.strictEqual(res.host.hasWindow, false);
    assert.strictEqual(res.host.packagesLoaded, 0);
    assert.strictEqual(typeof res.host.node, 'string');
  });

  it('errors on an unknown message type without dying', async () => {
    host.send({ type: 'nonsense-message', requestId: 9 });
    const res = await host.waitFor(m => m.type === 'response' && m.requestId === 9);
    assert.ok(res.error);
    assert.match(res.error.message, /Unknown package-host message/);

    // still alive
    host.send({ type: 'ping', requestId: 10 });
    const pong = await host.waitFor(m => m.type === 'response' && m.requestId === 10);
    assert.strictEqual(pong.pong, true);
  });

  it('exits cleanly on shutdown', async () => {
    const h = forkHost();
    await h.waitFor(m => m.type === 'host-booted');
    h.send({ type: 'shutdown' });
    await h.waitFor(m => m.type === 'host-shutdown');
    const code = await new Promise(resolve => h.child.on('exit', resolve));
    assert.strictEqual(code, 0);
  });

  it('loads no package until asked to', async () => {
    // 21.1 invariant, still true after 21.2 added activation: a freshly booted
    // host holds nothing until the editor sends activate-package.
    const h = forkHost();
    await h.waitFor(m => m.type === 'host-booted');
    h.send({ type: 'describe', requestId: 1 });
    const res = await h.waitFor(m => m.type === 'response' && m.requestId === 1);
    assert.strictEqual(res.host.packagesLoaded, 0);
    h.kill();
  });

  it('installs the restricted loader before any package can load', () => {
    const source = fs.readFileSync(HOST, 'utf8');
    // Guard against a future edit calling require() on package code without
    // the sandbox in place. The install() call must precede activation.
    const installAt = source.indexOf('restrictedRequire.install()');
    const activateAt = source.indexOf('function activatePackage');
    assert.ok(installAt !== -1, 'host must install the restricted loader');
    assert.ok(
      activateAt === -1 || installAt < activateAt,
      'restricted loader must be installed before activation is defined'
    );
  });
});

describe('package host manager — contract (21.1)', () => {
  it('exports the lifecycle surface the IPC layer uses', () => {
    // Loading the manager requires `electron`; assert on source instead so the
    // test runs on plain Node like the rest of script/ci.
    const source = fs.readFileSync(MANAGER, 'utf8');
    for (const name of [
      'ensureHost',
      'isRunning',
      'subscribe',
      'unsubscribe',
      'ping',
      'describe',
      'shutdownHost'
    ]) {
      assert.ok(
        new RegExp(`\\b${name}\\b`).test(source),
        `manager should export ${name}`
      );
    }
  });

  it('points at the real host script', () => {
    assert.ok(fs.existsSync(HOST), 'package-host.js should exist');
    const source = fs.readFileSync(MANAGER, 'utf8');
    assert.match(source, /workers'?,\s*'package-host\.js'/);
  });

  it('uses utilityProcess, not BrowserWindow', () => {
    const source = fs.readFileSync(MANAGER, 'utf8');
    assert.match(source, /utilityProcess\.fork/);
    assert.ok(
      !/new BrowserWindow/.test(source),
      'package host must not be a Node BrowserWindow (PR 9 deleted that path)'
    );
  });

  it('registers chevron:-prefixed IPC channels', () => {
    const ipc = fs.readFileSync(
      path.join(ROOT, 'src/main-process/register-renderer-ipc.js'),
      'utf8'
    );
    for (const ch of [
      'chevron:package-host-start',
      'chevron:package-host-status',
      'chevron:package-host-ping',
      'chevron:package-host-describe',
      'chevron:package-host-shutdown'
    ]) {
      assert.ok(ipc.includes(ch), `missing IPC channel ${ch}`);
    }
  });

  it('is gated by a config flag that defaults off', () => {
    const schema = fs.readFileSync(path.join(ROOT, 'src/config-schema.js'), 'utf8');
    assert.match(schema, /packageHostV2:\s*\{[\s\S]*?default:\s*false/);
  });
});
