'use strict';

/**
 * What a renderer may ask the pty host to run.
 *
 * A terminal is the widest request a renderer can make — it spawns arbitrary
 * processes — so the checks in front of it are the point of the feature, not
 * decoration around it. If the renderer could name any shell, any directory
 * and any environment, the FS IPC roots and the privileged-require
 * restriction would be describing a boundary that a terminal walks around.
 *
 * docs/process/next-tracks-plan.md, track 3.
 * Run: node --test script/ci/pty-ipc.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const os = require('os');
const path = require('path');

const {
  createPtyManager,
  validateShell,
  validateArgs,
  validateCwd,
  validateSize,
  sanitizeEnv
} = require('../../src/main-process/register-pty-ipc');

const ROOT = path.join(path.sep, 'repo', 'a');
const SHELL = path.join(path.sep, 'bin', 'bash');
const isFile = p => p === SHELL;
const isDirectory = p =>
  p === ROOT || p.startsWith(ROOT + path.sep) || p === os.homedir();

describe('the shell', () => {
  it('must be an absolute path to something that exists', () => {
    assert.strictEqual(validateShell(SHELL, { isFile }).ok, true);
    assert.strictEqual(validateShell('bash', { isFile }).ok, false, 'relative');
    assert.strictEqual(
      validateShell(path.join(path.sep, 'bin', 'nope'), { isFile }).ok,
      false,
      'missing'
    );
    assert.strictEqual(validateShell('', { isFile }).ok, false);
    assert.strictEqual(validateShell(null, { isFile }).ok, false);
    assert.strictEqual(
      validateShell(`${SHELL}\0evil`, { isFile }).ok,
      false,
      'a NUL truncates the string somewhere below this'
    );
  });
});

describe('the arguments', () => {
  it('must be nul-free strings, or absent', () => {
    assert.strictEqual(validateArgs(undefined).ok, true, 'absent is fine');
    assert.strictEqual(validateArgs([]).ok, true);
    assert.strictEqual(validateArgs(['-l', '-c', 'echo hi']).ok, true);
    assert.strictEqual(validateArgs('not an array').ok, false);
    assert.strictEqual(validateArgs([3]).ok, false, 'numbers are not strings');
    assert.strictEqual(validateArgs(['a\0b']).ok, false);
  });
});

describe('the working directory', () => {
  it('accepts a project root and anything under it', () => {
    assert.strictEqual(validateCwd(ROOT, [ROOT], { isDirectory }).ok, true);
    assert.strictEqual(
      validateCwd(path.join(ROOT, 'lib'), [ROOT], { isDirectory }).ok,
      true
    );
  });

  it('accepts the home directory, so a window with no project still works', () => {
    assert.strictEqual(validateCwd(os.homedir(), [], { isDirectory }).ok, true);
  });

  it('refuses somewhere outside every root', () => {
    const outside = path.join(path.sep, 'etc');
    assert.strictEqual(validateCwd(outside, [ROOT], { isDirectory }).ok, false);
  });

  it('refuses a sibling that merely shares a prefix', () => {
    const sibling = path.join(path.sep, 'repo', 'a-other');
    assert.strictEqual(validateCwd(sibling, [ROOT], { isDirectory }).ok, false);
  });

  it('refuses relative paths, empties and NULs', () => {
    assert.strictEqual(validateCwd('lib', [ROOT], { isDirectory }).ok, false);
    assert.strictEqual(validateCwd('', [ROOT], { isDirectory }).ok, false);
    assert.strictEqual(
      validateCwd(`${ROOT}\0/etc`, [ROOT], { isDirectory }).ok,
      false
    );
  });
});

describe('the size', () => {
  it('must be sane integers', () => {
    assert.strictEqual(validateSize(80, 24).ok, true);
    assert.strictEqual(validateSize(0, 24).ok, false);
    assert.strictEqual(validateSize(80, 0).ok, false);
    assert.strictEqual(validateSize(80.5, 24).ok, false);
    assert.strictEqual(validateSize(999999, 24).ok, false);
    assert.strictEqual(validateSize('80', 24).ok, false);
  });
});

describe('the environment', () => {
  it('passes through only the allowlist, as strings', () => {
    const env = sanitizeEnv({
      LANG: 'en_GB.UTF-8',
      COLORTERM: 'truecolor',
      LD_PRELOAD: '/tmp/evil.so',
      PATH: '/tmp/evil/bin',
      NODE_OPTIONS: '--require /tmp/evil.js',
      LC_ALL: { toString: () => 'sneaky' }
    });
    assert.deepStrictEqual(env, {
      LANG: 'en_GB.UTF-8',
      COLORTERM: 'truecolor'
    });
  });

  it('survives nonsense', () => {
    assert.deepStrictEqual(sanitizeEnv(null), {});
    assert.deepStrictEqual(sanitizeEnv('nope'), {});
    assert.deepStrictEqual(sanitizeEnv({ LANG: 'a\0b' }), {});
  });
});

describe('sessions belong to the window that asked', () => {
  function managerFor(sent) {
    const host = {
      postMessage: message => sent.push(message),
      on() {}
    };
    return {
      manager: createPtyManager({
        utilityProcess: { fork: () => host },
        getRoots: () => [ROOT],
        getAppPath: () => ROOT,
        isFile,
        isDirectory
      }),
      host
    };
  }

  const senderA = { id: 'a', send() {}, isDestroyed: () => false };
  const senderB = { id: 'b', send() {}, isDestroyed: () => false };

  it('spawns for a valid request and refuses an invalid one', () => {
    const sent = [];
    const { manager } = managerFor(sent);
    const session = manager.spawn(
      { shell: SHELL, cwd: ROOT, cols: 80, rows: 24 },
      senderA
    );
    assert.ok(session.id, 'returns a session id');
    assert.strictEqual(sent[0].type, 'spawn');
    assert.strictEqual(sent[0].shell, SHELL);

    assert.throws(
      () => manager.spawn({ shell: SHELL, cwd: path.sep + 'etc', cols: 80, rows: 24 }, senderA),
      /outside every project root/
    );
  });

  it('will not let one window write to another window\'s terminal', () => {
    const sent = [];
    const { manager } = managerFor(sent);
    const { id } = manager.spawn(
      { shell: SHELL, cwd: ROOT, cols: 80, rows: 24 },
      senderA
    );
    sent.length = 0;

    assert.strictEqual(manager.write({ id, data: 'rm -rf /\r' }, senderB), false);
    assert.strictEqual(manager.resize({ id, cols: 10, rows: 10 }, senderB), false);
    assert.strictEqual(manager.kill({ id }, senderB), false);
    assert.deepStrictEqual(sent, [], 'nothing reached the host');

    assert.strictEqual(manager.write({ id, data: 'ls\r' }, senderA), true);
  });

  it('refuses to write anything that is not a string', () => {
    const sent = [];
    const { manager } = managerFor(sent);
    const { id } = manager.spawn(
      { shell: SHELL, cwd: ROOT, cols: 80, rows: 24 },
      senderA
    );
    assert.strictEqual(manager.write({ id, data: 42 }, senderA), false);
    assert.strictEqual(manager.write({ id, data: null }, senderA), false);
  });

  it('takes a window\'s shells with it when the window goes', () => {
    const sent = [];
    const { manager } = managerFor(sent);
    manager.spawn({ shell: SHELL, cwd: ROOT, cols: 80, rows: 24 }, senderA);
    manager.spawn({ shell: SHELL, cwd: ROOT, cols: 80, rows: 24 }, senderB);
    assert.strictEqual(manager.sessionCount, 2);

    manager.killForSender(senderA);
    assert.strictEqual(manager.sessionCount, 1);
    assert.ok(sent.some(m => m.type === 'kill'), 'the host was told to kill it');
  });
});
