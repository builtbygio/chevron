'use strict';

/**
 * The debugger and the SSH editor are new ways for a renderer to make main
 * spawn something. The payload is checked before any process is started.
 *
 * Run: node --test script/ci/debug-ssh-ipc.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createDebugManager } = require('../../src/main-process/register-debug-ipc');
const { createSshApi } = require('../../src/main-process/register-ssh-ipc');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chevron-debug-ssh-'));
const program = path.join(root, 'app.js');
fs.writeFileSync(program, 'console.log(1)\n');

const sender = {
  id: 7,
  isDestroyed() {
    return false;
  },
  send() {}
};

describe('debug start', () => {
  it('does not launch an adapter for a program outside the project', async () => {
    let forked = false;
    const manager = createDebugManager({
      forkImpl() {
        forked = true;
      },
      getRoots() {
        return [root];
      },
      isFile: file => file === program
    });
    await assert.rejects(
      () => manager.start(sender, { program: path.join(path.sep, 'etc', 'passwd.js') }),
      /outside every project root/
    );
    assert.strictEqual(forked, false);
  });

  it('refuses a debug command that is not a single word when no session exists', async () => {
    const manager = createDebugManager({
      forkImpl() {
        throw new Error('should not fork');
      },
      getRoots() {
        return [root];
      }
    });
    await assert.rejects(
      () => manager.request(sender, { command: 'continue;rm' }),
      /unknown debug command/
    );
  });
});

describe('ssh', () => {
  it('does not run ssh for a path with shell characters', async () => {
    const calls = [];
    const api = createSshApi({
      execFile(cmd, args, opts, cb) {
        calls.push({ cmd, args });
        cb(null, '');
      }
    });
    await assert.rejects(
      () => api.read({ host: 'me@host', path: '/tmp/a;rm' }),
      /shell characters/
    );
    await assert.rejects(
      () => api.write({ host: 'me@host', path: '/tmp/a', text: 12 }),
      /string/
    );
    assert.deepStrictEqual(calls, []);
  });

  it('lists a directory with a fixed ls command', async () => {
    const calls = [];
    const api = createSshApi({
      execFile(cmd, args, opts, cb) {
        calls.push({ cmd, args });
        cb(null, 'a.js\n');
      }
    });
    const listed = await api.list({ host: 'me@host', path: '/tmp/proj' });
    assert.deepStrictEqual(listed.names, ['a.js']);
    assert.strictEqual(calls[0].cmd, 'ssh');
    assert.strictEqual(calls[0].args.at(-1), 'ls -1 -- /tmp/proj');
    assert.ok(!calls[0].args.at(-1).includes(';'));
  });
});
