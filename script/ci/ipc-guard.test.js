'use strict';

/**
 * The shared IPC payload checks, tested on what they refuse.
 *
 * docs/process/ipc-surface-hardening.md
 * Run: node --test script/ci/ipc-guard.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');

const guard = require('../../src/main-process/ipc-guard');

const NUL = '\u0000';

describe('requireString', () => {
  it('accepts a plain string', () => {
    assert.equal(guard.requireString('hello').ok, true);
  });

  it('refuses a NUL, which truncates the value somewhere below this', () => {
    const result = guard.requireString(`ok${NUL}rm -rf /`);
    assert.equal(result.ok, false);
    assert.match(result.reason, /nul-free/);
  });

  it('refuses what is not a string', () => {
    for (const value of [null, undefined, 42, {}, [], true]) {
      assert.equal(guard.requireString(value).ok, false, String(value));
    }
  });

  it('refuses empty unless asked not to', () => {
    assert.equal(guard.requireString('').ok, false);
    assert.equal(guard.requireString('', { allowEmpty: true }).ok, true);
  });

  it('names the field in the reason', () => {
    assert.match(guard.requireString(1, { name: 'shell' }).reason, /shell/);
  });
});

describe('requireInt', () => {
  it('accepts an integer in range', () => {
    assert.equal(guard.requireInt(80, { min: 1, max: 5000 }).ok, true);
  });

  it('refuses out of range at both ends', () => {
    assert.equal(guard.requireInt(0, { min: 1, max: 5000 }).ok, false);
    assert.equal(guard.requireInt(5001, { min: 1, max: 5000 }).ok, false);
  });

  it('refuses a float, a string and NaN', () => {
    for (const value of [1.5, '80', NaN, Infinity, null]) {
      assert.equal(guard.requireInt(value).ok, false, String(value));
    }
  });
});

describe('requireStringArray', () => {
  it('accepts absent, empty and all-string arrays', () => {
    assert.equal(guard.requireStringArray(undefined).ok, true);
    assert.equal(guard.requireStringArray(null).ok, true);
    assert.equal(guard.requireStringArray([]).ok, true);
    assert.equal(guard.requireStringArray(['--flag', 'value', '']).ok, true);
  });

  it('refuses a non-array and a non-string entry', () => {
    assert.equal(guard.requireStringArray('flags').ok, false);
    assert.equal(guard.requireStringArray([1]).ok, false);
    assert.equal(guard.requireStringArray([null]).ok, false);
  });

  it('refuses a NUL inside an entry', () => {
    assert.equal(guard.requireStringArray([`a${NUL}b`]).ok, false);
  });

  it('can require the array to be present', () => {
    assert.equal(guard.requireStringArray(undefined, { optional: false }).ok, false);
  });
});

describe('requireAbsolutePath', () => {
  it('accepts an absolute path when no roots are given', () => {
    assert.equal(guard.requireAbsolutePath(path.join(path.sep, 'tmp', 'x')).ok, true);
  });

  it('refuses relative, empty and nul-bearing paths', () => {
    assert.equal(guard.requireAbsolutePath('rel/path').ok, false);
    assert.equal(guard.requireAbsolutePath('').ok, false);
    assert.equal(guard.requireAbsolutePath(`${path.sep}tmp${NUL}${path.sep}x`).ok, false);
  });

  it('confines to roots when they are given', () => {
    const root = path.join(path.sep, 'repo', 'a');
    assert.equal(guard.requireAbsolutePath(path.join(root, 'src'), { roots: [root] }).ok, true);
    assert.equal(guard.requireAbsolutePath(root, { roots: [root] }).ok, true);
    assert.equal(
      guard.requireAbsolutePath(path.join(path.sep, 'repo', 'b'), { roots: [root] }).ok,
      false
    );
  });

  it('is not fooled by a prefix that is not a path boundary', () => {
    const root = path.join(path.sep, 'repo', 'a');
    assert.equal(
      guard.requireAbsolutePath(path.join(path.sep, 'repo', 'ab', 'f'), { roots: [root] }).ok,
      false
    );
  });

  it('refuses everything when the root list is empty', () => {
    assert.equal(guard.requireAbsolutePath(path.join(path.sep, 'x'), { roots: [] }).ok, false);
  });
});

describe('requireDirectoryInRoots', () => {
  const root = path.join(path.sep, 'repo', 'a');
  const isDirectory = () => true;

  it('accepts a directory inside a root', () => {
    assert.equal(
      guard.requireDirectoryInRoots(path.join(root, 'sub'), [root], { isDirectory }).ok,
      true
    );
  });

  it('accepts the home directory even with no roots', () => {
    assert.equal(guard.requireDirectoryInRoots(os.homedir(), [], { isDirectory }).ok, true);
  });

  it('refuses somewhere outside, and says so in terms of project roots', () => {
    const result = guard.requireDirectoryInRoots(path.join(path.sep, 'elsewhere'), [root], {
      isDirectory
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /outside every project root/);
  });

  it('refuses a path that is not a directory', () => {
    const result = guard.requireDirectoryInRoots(path.join(root, 'file'), [root], {
      isDirectory: () => false
    });
    assert.equal(result.ok, false);
    assert.match(result.reason, /not a directory/);
  });
});

describe('requireOwnerWindow', () => {
  const BrowserWindow = { fromWebContents: wc => (wc && wc.win) || null };

  it('returns the sender window', () => {
    const win = { id: 7 };
    const result = guard.requireOwnerWindow({ sender: { win } }, { BrowserWindow });
    assert.equal(result.ok, true);
    assert.equal(result.window, win);
  });

  it('refuses when there is no sender or no window', () => {
    assert.equal(guard.requireOwnerWindow({}, { BrowserWindow }).ok, false);
    assert.equal(guard.requireOwnerWindow({ sender: {} }, { BrowserWindow }).ok, false);
  });
});

describe('requireOwner', () => {
  it('accepts a resource the sender created', () => {
    assert.equal(guard.requireOwner({ sender: { id: 3 } }, { managerWcId: 3 }).ok, true);
  });

  it('refuses another window resource, and a missing one', () => {
    assert.equal(guard.requireOwner({ sender: { id: 3 } }, { managerWcId: 4 }).ok, false);
    assert.equal(guard.requireOwner({ sender: { id: 3 } }, null).ok, false);
  });

  it('does not treat undefined ids as a match', () => {
    // Both sides undefined must not pass; that is how an unowned resource
    // becomes everyone's.
    assert.equal(guard.requireOwner({ sender: {} }, {}).ok, false);
  });
});

describe('sanitizeEnv', () => {
  const allow = new Set(['LANG', 'COLORTERM']);

  it('keeps only allowlisted string values', () => {
    const out = guard.sanitizeEnv(
      { LANG: 'en_GB.UTF-8', COLORTERM: 'truecolor', LD_PRELOAD: '/evil.so', PATH: '/x' },
      allow
    );
    assert.deepEqual(out, { LANG: 'en_GB.UTF-8', COLORTERM: 'truecolor' });
  });

  it('drops non-strings and NUL-bearing values', () => {
    assert.deepEqual(guard.sanitizeEnv({ LANG: 5 }, allow), {});
    assert.deepEqual(guard.sanitizeEnv({ LANG: `a${NUL}b` }, allow), {});
  });

  it('survives nonsense', () => {
    assert.deepEqual(guard.sanitizeEnv(null, allow), {});
    assert.deepEqual(guard.sanitizeEnv('LANG=x', allow), {});
  });
});

describe('isSafeAbsolutePath', () => {
  it('is the absolute, nul-free check with no opinion about roots', () => {
    assert.equal(guard.isSafeAbsolutePath(path.join(path.sep, 'anywhere', 'at', 'all')), true);
    assert.equal(guard.isSafeAbsolutePath('relative'), false);
    assert.equal(guard.isSafeAbsolutePath(`${path.sep}a${NUL}b`), false);
    assert.equal(guard.isSafeAbsolutePath(null), false);
  });
});
