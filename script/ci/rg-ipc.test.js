'use strict';

/**
 * Main-side ripgrep spawn is allowlisted; cancel kills the child.
 * Run: node --test script/ci/rg-ipc.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const { EventEmitter } = require('events');
const path = require('path');
const {
  validateArgs,
  validateCwd,
  createRgSearchManager
} = require('../../src/main-process/register-rg-ipc');

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = function() {
    this.killed = true;
    this.emit('close', null, 'SIGTERM');
  };
  return child;
}

describe('validateArgs', () => {
  const good = [
    '--json',
    '--regexp',
    'foo',
    '--hidden',
    '.'
  ];

  it('accepts the find-in-project flag set', () => {
    assert.strictEqual(validateArgs(good).ok, true);
  });

  it('rejects --replace and other write flags', () => {
    assert.strictEqual(
      validateArgs(['--json', '--regexp', 'a', '--replace', 'b', '.']).ok,
      false
    );
    assert.strictEqual(validateArgs(['--json', '--regexp', 'a', '-e', 'x', '.']).ok, false);
  });

  it('rejects a search path other than "."', () => {
    assert.strictEqual(
      validateArgs(['--json', '--regexp', 'a', '/etc/passwd']).ok,
      false
    );
  });

  it('requires --json and --regexp', () => {
    assert.strictEqual(validateArgs(['--hidden', '.']).ok, false);
  });
});

describe('validateCwd', () => {
  it('requires an absolute existing directory', () => {
    assert.strictEqual(validateCwd('relative', () => true), false);
    assert.strictEqual(validateCwd('/tmp\0x', () => true), false);
    assert.strictEqual(validateCwd(path.resolve('/tmp'), () => false), false);
    assert.strictEqual(validateCwd(path.resolve('/tmp'), () => true), true);
  });
});

describe('createRgSearchManager cancel', () => {
  it('kills the main-side child', () => {
    const child = fakeChild();
    const sent = [];
    const sender = {
      isDestroyed: () => false,
      send: (channel, msg) => sent.push({ channel, msg })
    };
    const manager = createRgSearchManager({
      spawn: () => child,
      resolveRgPath: () => '/bin/rg',
      existsSync: () => true,
      isDirectory: () => true
    });
    const { searchId } = manager.start({
      args: ['--json', '--regexp', 'x', '.'],
      cwd: path.resolve('/tmp'),
      sender
    });
    assert.ok(searchId);
    assert.strictEqual(manager.searches.has(searchId), true);
    const result = manager.cancel(searchId, sender);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(child.killed, true);
    assert.ok(sent.some(s => s.channel === 'chevron:rg-search-close'));
    assert.strictEqual(manager.searches.has(searchId), false);
  });

  it('does not spawn an arbitrary binary', () => {
    let spawned = null;
    const manager = createRgSearchManager({
      spawn: (bin, args, opts) => {
        spawned = { bin, args, opts };
        return fakeChild();
      },
      resolveRgPath: () => '/app/@vscode/ripgrep/bin/rg',
      existsSync: () => true,
      isDirectory: () => true
    });
    manager.start({
      args: ['--json', '--regexp', 'x', '.'],
      cwd: path.resolve('/tmp'),
      sender: { isDestroyed: () => true, send() {} }
    });
    assert.strictEqual(spawned.bin, '/app/@vscode/ripgrep/bin/rg');
    assert.strictEqual(spawned.opts.shell, false);
  });
});
