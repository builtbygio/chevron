'use strict';

/**
 * Epic 21 slice 21.3 — services across the host boundary.
 * Run: node --test script/ci/package-host-services.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const { fork } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOST = path.join(ROOT, 'src/main-process/workers/package-host.js');
const PROVIDER = path.join(
  ROOT,
  'spec/fixtures/packages/package-host-service-provider'
);
const CONSUMER = path.join(
  ROOT,
  'spec/fixtures/packages/package-host-service-consumer'
);

const svc = require('../../src/main-process/workers/package-host-services');

/**
 * Fork the host and stand in for the manager, including the reverse-RPC side
 * (host-request -> host-response) that lets host packages call editor services.
 */
function forkHost({ editorServices = {} } = {}) {
  const child = fork(HOST, [], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const inbox = [];
  const waiters = [];
  const editorCalls = [];

  child.on('message', msg => {
    if (msg && msg.type === 'host-request') {
      editorCalls.push(msg);
      const key = `${msg.name}@${msg.version}`;
      const impl = editorServices[key];
      const reply = payload =>
        child.send(Object.assign({ type: 'host-response', hostRequestId: msg.hostRequestId }, payload));
      if (!impl || typeof impl[msg.method] !== 'function') {
        reply({ error: { message: `No such editor service: ${key}` } });
      } else {
        Promise.resolve()
          .then(() => impl[msg.method](...(msg.args || [])))
          .then(result => reply({ result }))
          .catch(err => reply({ error: { message: err.message } }));
      }
      return;
    }
    const i = waiters.findIndex(w => w.match(msg));
    if (i !== -1) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });

  let id = 0;
  const api = {
    child,
    editorCalls,
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
    kill: () => child.kill()
  };
  return api;
}

describe('package host v2 — semver-lite range matching (21.3)', () => {
  it('matches caret ranges within the same major', () => {
    assert.strictEqual(svc.satisfies('1.2.0', '^1.0.0'), true);
    assert.strictEqual(svc.satisfies('1.0.0', '^1.0.0'), true);
    assert.strictEqual(svc.satisfies('2.0.0', '^1.0.0'), false);
    assert.strictEqual(svc.satisfies('0.9.0', '^1.0.0'), false);
  });

  it('matches tilde, comparator, exact and wildcard ranges', () => {
    assert.strictEqual(svc.satisfies('1.2.9', '~1.2.0'), true);
    assert.strictEqual(svc.satisfies('1.3.0', '~1.2.0'), false);
    assert.strictEqual(svc.satisfies('2.0.0', '>=1.5.0'), true);
    assert.strictEqual(svc.satisfies('1.0.0', '<2.0.0'), true);
    assert.strictEqual(svc.satisfies('1.2.3', '1.2.3'), true);
    assert.strictEqual(svc.satisfies('1.2.3', '1.2.4'), false);
    assert.strictEqual(svc.satisfies('9.9.9', '*'), true);
  });

  it('describes prototype methods of a class instance', () => {
    class S {
      a() {}
      b() {}
    }
    const methods = svc.describeService(new S()).sort();
    assert.deepStrictEqual(methods, ['a', 'b']);
  });
});

describe('package host v2 — host provides a service (21.3)', () => {
  let host;

  before(async () => {
    host = forkHost();
    await host.waitFor(m => m.type === 'host-booted');
    const res = await host.request({
      type: 'activate-package',
      name: 'package-host-service-provider',
      root: PROVIDER,
      configSnapshot: {}
    });
    assert.ok(!res.error, res.error && res.error.message);
  });

  after(() => host && host.kill());

  it('reports the provided service as a descriptor', async () => {
    const res = await host.request({ type: 'list-services' });
    const entry = res.services.find(s => s.name === 'host-math');
    assert.ok(entry, 'host-math should be registered');
    assert.strictEqual(entry.version, '1.2.0');
    assert.strictEqual(entry.packageName, 'package-host-service-provider');
    assert.ok(entry.methods.includes('add'));
    assert.ok(entry.methods.includes('slowDouble'));
  });

  it('calls a sync service method across the boundary', async () => {
    const res = await host.request({
      type: 'call-service',
      name: 'host-math',
      version: '1.2.0',
      method: 'add',
      args: [2, 40]
    });
    assert.strictEqual(res.result, 42);
  });

  it('awaits an async service method', async () => {
    const res = await host.request({
      type: 'call-service',
      name: 'host-math',
      version: '1.2.0',
      method: 'slowDouble',
      args: [21]
    });
    assert.strictEqual(res.result, 42);
  });

  it('propagates a throwing service method as an error', async () => {
    const res = await host.request({
      type: 'call-service',
      name: 'host-math',
      version: '1.2.0',
      method: 'boom',
      args: []
    });
    assert.ok(res.error);
    assert.match(res.error.message, /service method failed/);
  });

  it('rejects unknown service and unknown method', async () => {
    const noService = await host.request({
      type: 'call-service',
      name: 'nope',
      version: '1.0.0',
      method: 'x'
    });
    assert.match(noService.error.message, /No such host service/);

    const noMethod = await host.request({
      type: 'call-service',
      name: 'host-math',
      version: '1.2.0',
      method: 'notAMethod'
    });
    assert.match(noMethod.error.message, /has no method/);
  });

  it('drops the service when the package deactivates', async () => {
    await host.request({
      type: 'deactivate-package',
      name: 'package-host-service-provider'
    });
    const res = await host.request({ type: 'list-services' });
    assert.strictEqual(res.services.length, 0);
  });
});

describe('package host v2 — host consumes an editor service (21.3)', () => {
  let host;

  before(async () => {
    host = forkHost({
      editorServices: {
        'editor-clock@2.1.0': { now: () => 1234567890 }
      }
    });
    await host.waitFor(m => m.type === 'host-booted');
  });

  after(() => host && host.kill());

  it('wires a service offered before activation', async () => {
    await host.request({
      type: 'offer-editor-service',
      name: 'editor-clock',
      version: '2.1.0',
      methods: ['now']
    });
    const res = await host.request({
      type: 'activate-package',
      name: 'package-host-service-consumer',
      root: CONSUMER,
      configSnapshot: {}
    });
    assert.ok(!res.error, res.error && res.error.message);
    assert.deepStrictEqual(res.consumedServices, [
      { name: 'editor-clock', version: '2.1.0' }
    ]);
  });

  it('lets host package code call back into the editor service', async () => {
    const res = await host.request({
      type: 'call-service',
      name: 'consumer-probe',
      version: '1.0.0',
      method: 'askClock',
      args: []
    });
    assert.strictEqual(res.result, 1234567890);
    assert.ok(
      host.editorCalls.some(c => c.name === 'editor-clock' && c.method === 'now'),
      'expected a reverse RPC to the editor service'
    );
  });

  it('never calls a consumer whose service was not offered', async () => {
    const res = await host.request({
      type: 'call-service',
      name: 'consumer-probe',
      version: '1.0.0',
      method: 'missingConsumed'
    });
    assert.strictEqual(res.result, false);
  });

  it('does not re-wire an already-consumed service when re-offered', async () => {
    await host.request({
      type: 'offer-editor-service',
      name: 'editor-clock',
      version: '2.1.0',
      methods: ['now']
    });
    const res = await host.request({
      type: 'call-service',
      name: 'consumer-probe',
      version: '1.0.0',
      method: 'consumeCount'
    });
    assert.strictEqual(res.result, 1, 'consumer method must be called once');
  });
});

describe('package host v2 — late service offers (21.3)', () => {
  let host;

  before(async () => {
    host = forkHost({
      editorServices: { 'editor-clock@2.5.0': { now: () => 777 } }
    });
    await host.waitFor(m => m.type === 'host-booted');
  });

  after(() => host && host.kill());

  it('reaches a package that activated before the service existed', async () => {
    const activated = await host.request({
      type: 'activate-package',
      name: 'package-host-service-consumer',
      root: CONSUMER,
      configSnapshot: {}
    });
    assert.deepStrictEqual(activated.consumedServices, []);

    const offered = await host.request({
      type: 'offer-editor-service',
      name: 'editor-clock',
      version: '2.5.0',
      methods: ['now']
    });
    assert.ok(
      offered.wired.some(w => w.packageName === 'package-host-service-consumer'),
      'late offer should wire the existing consumer'
    );

    const res = await host.request({
      type: 'call-service',
      name: 'consumer-probe',
      version: '1.0.0',
      method: 'askClock'
    });
    assert.strictEqual(res.result, 777);
  });
});
