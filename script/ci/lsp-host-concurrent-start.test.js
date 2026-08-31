'use strict';

/**
 * A second ensureHost() during boot resolves when the host boots.
 *
 * lsp-worker-manager assigns `host` synchronously after utilityProcess.fork(),
 * so any caller arriving before the host-booted message lands in the
 * "host && !hostReady" branch. That branch used to do
 *
 *   const t = setTimeout(() => reject(new Error('LSP host start timeout')), 10000)
 *   host._waitReady = onReady
 *
 * and nothing ever called `_waitReady`. So every concurrent caller waited the
 * full ten seconds and then rejected, which surfaced to the user as
 *
 *   Language server failed to start: Error invoking remote method
 *   'lsp:start-server': Error: LSP host start timeout
 *
 * ensureHost has four call sites, so overlapping calls are the normal case,
 * not an edge one.
 *
 * The manager requires electron, so this exercises the same waiter-queue logic
 * against a stub rather than booting a real utilityProcess.
 *
 * Run: node --test script/ci/lsp-host-concurrent-start.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANAGER = path.join(ROOT, 'src', 'main-process', 'lsp-worker-manager.js');

describe('lsp host concurrent start', () => {
  // Strip comments first: the fix documents the old `host._waitReady` line by
  // name, and a naive scan for the string matches that explanation. Same trap
  // the LESS converter hit reading its own comment.
  function codeOf(file) {
    return fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  }

  it('does not park waiters on an uncalled callback', () => {
    const src = codeOf(MANAGER);
    assert.ok(
      !/_waitReady/.test(src),
      'host._waitReady was assigned and never invoked, so every caller that ' +
        'arrived during boot timed out. If it is reintroduced, something must ' +
        'actually call it.'
    );
  });

  it('settles queued waiters on both boot and exit', () => {
    const src = codeOf(MANAGER);
    assert.ok(
      /settleReadyWaiters\(null\)/.test(src),
      'host-booted must release waiters queued during boot'
    );
    assert.ok(
      /settleReadyWaiters\(new Error/.test(src),
      'host exit must reject waiters queued during boot, or they hang until ' +
        'their own timeout'
    );
  });

  it('the queue wakes every waiter exactly once', () => {
    // Same shape as the manager's queue, exercised directly.
    let readyWaiters = [];
    const settle = error => {
      const waiters = readyWaiters;
      readyWaiters = [];
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        if (error) waiter.reject(error);
        else waiter.resolve();
      }
    };
    const waitForReady = () =>
      new Promise((resolve, reject) => {
        const waiter = { resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          readyWaiters = readyWaiters.filter(w => w !== waiter);
          reject(new Error('LSP host start timeout'));
        }, 10000);
        readyWaiters.push(waiter);
      });

    const first = waitForReady();
    const second = waitForReady();
    const third = waitForReady();
    assert.equal(readyWaiters.length, 3);

    settle(null);
    assert.equal(readyWaiters.length, 0, 'queue must be drained');

    return Promise.all([first, second, third]).then(() => {
      // A later settle must not throw on an empty queue.
      settle(new Error('host exited'));
    });
  });

  it('rejects queued waiters when the host exits during boot', () => {
    let readyWaiters = [];
    const settle = error => {
      const waiters = readyWaiters;
      readyWaiters = [];
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
        if (error) waiter.reject(error);
        else waiter.resolve();
      }
    };
    const pending = new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => reject(new Error('timeout')), 10000);
      readyWaiters.push(waiter);
    });

    settle(new Error('LSP host exited (1)'));
    return assert.rejects(() => pending, /LSP host exited/);
  });
});
