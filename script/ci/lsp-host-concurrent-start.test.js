'use strict';

/**
 * A second ensureHost() during boot resolves when the host boots.
 *
 * Callers arriving before the host-booted message were parked on a callback
 * nothing invoked, so each waited the full ten seconds and rejected. ensureHost
 * has four call sites, so overlapping calls are the normal case.
 *
 * Exercises the waiter queue against a stub, since the manager needs electron.
 *
 * Run: node --test script/ci/lsp-host-concurrent-start.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MANAGER = path.join(ROOT, 'src', 'main-process', 'lsp-worker-manager.js');

describe('lsp autocomplete provider', () => {
  it('never claims exclusivity over lower-priority providers', () => {
    // excludeLowerPriority drops the built-in word provider at filter time,
    // before this provider has a chance to return []. It returns [] with no
    // server, with an untrusted project, while initialising, and whenever the
    // server has nothing -- each of which became "no completions at all" in
    // every language the selector claims. suggestionPriority does the ranking.
    const src = fs
      .readFileSync(
        path.join(ROOT, 'src', 'lsp', 'providers', 'autocomplete.js'),
        'utf8'
      )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(
      !/excludeLowerPriority/.test(src),
      'the LSP autocomplete provider must not set excludeLowerPriority, in ' +
        'any form -- static or getter. Rank with suggestionPriority instead.'
    );
    assert.ok(
      /suggestionPriority:\s*[1-9]/.test(src),
      'server results still need to outrank word matches'
    );
  });
});

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
