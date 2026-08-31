'use strict';

/**
 * Temp directories are created through the helper that removes them.
 *
 * mkdtempSync leaks by default: the removal is a separate statement, so it gets
 * forgotten, or written somewhere that does not run on every path, or skipped
 * because node was signalled and `finally` never ran. Three callers had leaked
 * 1113 directories and 673 MB into /tmp -- 406 of them from suites that had
 * already been deleted, so nothing was even left to notice.
 *
 * script/lib/temp-dir.js registers each directory as it hands it out and
 * removes them on exit and on SIGINT/SIGTERM/SIGHUP. This asserts build and CI
 * code goes through it rather than calling mkdtempSync directly.
 *
 * Run: node --test script/ci/temp-dir-hygiene.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HELPER = path.join(ROOT, 'script', 'lib', 'temp-dir.js');

function jsFilesUnder(dir) {
  const found = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
        continue;
      }
      if (entry.name.endsWith('.js')) found.push(full);
    }
  };
  walk(dir);
  return found;
}

describe('temp directory hygiene', () => {
  it('the helper exists and cleans up on signals as well as exit', () => {
    const src = fs.readFileSync(HELPER, 'utf8');
    assert.ok(/process\.on\('exit'/.test(src), 'must clean up on normal exit');
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      assert.ok(
        src.includes(signal),
        `must clean up on ${signal}: a finally does not run when node is ` +
          'signalled, which is how these leaked in the first place'
      );
    }
  });

  it('build and CI code does not call mkdtempSync directly', () => {
    const offenders = [];
    for (const file of jsFilesUnder(path.join(ROOT, 'script'))) {
      if (file === HELPER) continue; // the helper is the one place it belongs
      if (file === __filename) continue; // this file names it in order to ban it
      const src = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/mkdtempSync/.test(src)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'use makeTempDir from script/lib/temp-dir.js so the directory is ' +
        'removed on exit and on a signal:\n  ' + offenders.join('\n  ')
    );
  });

  it('the helper actually removes what it hands out', () => {
    delete require.cache[require.resolve(HELPER)];
    const { makeTempDir, removeAll } = require(HELPER);
    const dir = makeTempDir('chevron-hygiene-test-');
    assert.ok(fs.existsSync(dir), 'directory should exist once created');
    fs.writeFileSync(path.join(dir, 'file.txt'), 'contents');
    removeAll();
    assert.ok(
      !fs.existsSync(dir),
      'removeAll must delete the directory and its contents'
    );
  });
});
