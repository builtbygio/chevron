'use strict';

/**
 * Epic 21 slice 21.2 — activate a logic-only package inside the host.
 * Run: node --test script/ci/package-host-activate.test.js
 *
 * Forks workers/package-host.js as a plain child_process (no Electron) and
 * drives the activation protocol the main-process manager speaks.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src/main-process/workers/package-host.js');
const LOGIC_ONLY = path.join(
  ROOT,
  'spec/fixtures/packages/package-host-logic-only'
);
const PRIVILEGED = path.join(
  ROOT,
  'spec/fixtures/packages/package-host-privileged'
);

function forkHost() {
  const child = fork(HOST, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const inbox = [];
  const waiters = [];
  child.on('message', msg => {
    const i = waiters.findIndex(w => w.match(msg));
    if (i !== -1) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  let id = 0;
  const api = {
    child,
    waitFor(match, timeoutMs = 8000) {
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
    request(msg) {
      const requestId = ++id;
      child.send(Object.assign({ requestId }, msg));
      return api.waitFor(m => m.type === 'response' && m.requestId === requestId);
    },
    contributions() {
      return inbox.filter(m => m.type === 'package-contribution');
    },
    kill: () => child.kill()
  };
  return api;
}

describe('package host v2 — activation (21.2)', () => {
  let host;

  before(async () => {
    host = forkHost();
    await host.waitFor(m => m.type === 'host-booted');
  });

  after(() => {
    if (host) host.kill();
  });

  it('activates a logic-only package', async () => {
    const res = await host.request({
      type: 'activate-package',
      name: 'package-host-logic-only',
      root: LOGIC_ONLY,
      configSnapshot: { 'package-host-logic-only': { greeting: 'howdy' } }
    });
    assert.ok(!res.error, res.error && res.error.message);
    assert.strictEqual(res.activated, true);
    assert.strictEqual(res.name, 'package-host-logic-only');
  });

  it('reports the package as loaded', async () => {
    const res = await host.request({ type: 'describe' });
    assert.strictEqual(res.host.packagesLoaded, 1);
    assert.deepStrictEqual(res.host.packages, ['package-host-logic-only']);
  });

  it('registered the package command through the stub', async () => {
    const res = await host.request({ type: 'list-packages' });
    const entry = res.packages.find(p => p.name === 'package-host-logic-only');
    assert.ok(entry, 'package should be listed');
    assert.deepStrictEqual(entry.commands, ['package-host-logic-only:greet']);
  });

  it('streams contributions to the editor as descriptors', () => {
    const kinds = host.contributions().map(m => m.descriptor.kind);
    assert.ok(kinds.includes('commands.add'), `saw kinds: ${kinds.join(',')}`);
  });

  it('served config.observe from the snapshot synchronously', async () => {
    // The fixture stores the observed value during activate(); dispatching the
    // command makes it emit a notification containing that value.
    const res = await host.request({
      type: 'dispatch-command',
      name: 'package-host-logic-only',
      command: 'package-host-logic-only:greet'
    });
    assert.strictEqual(res.dispatched, true);
    const note = host
      .contributions()
      .map(m => m.descriptor)
      .find(d => d.kind === 'notifications.add');
    assert.ok(note, 'expected a notification descriptor');
    assert.match(note.message, /howdy from the package host/);
  });

  it('pushes editor config changes into observers', async () => {
    await host.request({
      type: 'config-changed',
      keyPath: 'package-host-logic-only.greeting',
      value: 'salut'
    });
    await host.request({
      type: 'dispatch-command',
      name: 'package-host-logic-only',
      command: 'package-host-logic-only:greet'
    });
    const notes = host
      .contributions()
      .map(m => m.descriptor)
      .filter(d => d.kind === 'notifications.add');
    assert.match(notes[notes.length - 1].message, /salut from the package host/);
  });

  it('deactivates and returns serialized state', async () => {
    const res = await host.request({
      type: 'deactivate-package',
      name: 'package-host-logic-only'
    });
    assert.strictEqual(res.deactivated, true);
    assert.strictEqual(res.state.dispatchCount, 2);

    const after = await host.request({ type: 'describe' });
    assert.strictEqual(after.host.packagesLoaded, 0);
  });
});

describe('package host v2 — restricted loader (21.2)', () => {
  let host;

  before(async () => {
    host = forkHost();
    await host.waitFor(m => m.type === 'host-booted');
  });

  after(() => {
    if (host) host.kill();
  });

  it('refuses a privileged require from package code', async () => {
    const res = await host.request({
      type: 'activate-package',
      name: 'package-host-privileged',
      root: PRIVILEGED,
      configSnapshot: {}
    });
    assert.ok(res.error, 'activation should fail');
    assert.match(res.error.message, /blocked require\("fs"\)/);
  });

  it('does not leave a half-activated package behind', async () => {
    const res = await host.request({ type: 'describe' });
    assert.strictEqual(res.host.packagesLoaded, 0);
  });

  it('survives the refusal and still activates a good package', async () => {
    const res = await host.request({
      type: 'activate-package',
      name: 'package-host-logic-only',
      root: LOGIC_ONLY,
      configSnapshot: {}
    });
    assert.ok(!res.error);
    assert.strictEqual(res.activated, true);
  });

  it('hands package code the stub, not the real chevron API', async () => {
    // The fixture requires('chevron'); if it had received the real module the
    // activation would have thrown (no editor in this process).
    const res = await host.request({ type: 'list-packages' });
    assert.strictEqual(res.packages.length, 1);
  });
});
