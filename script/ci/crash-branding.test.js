'use strict';

/**
 * Crash / recovery copy is Chevron, not Atom.
 * Run: node --test script/ci/crash-branding.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// The old Atom issue URL, only when it is a link target. A prose mention of
// the repository name is not that link.
function mentionsAtomRepo(src) {
  const needle = 'github.com/atom/atom';
  let from = 0;
  while (from < src.length) {
    const at = src.indexOf(needle, from);
    if (at === -1) return false;
    const next = src.charAt(at + needle.length);
    if (next === "'" || next === '"') return true;
    from = at + needle.length;
  }
  return false;
}

describe('crash branding', () => {
  it('render-process-gone dialog reports to builtbygio/chevron', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/main-process/chevron-window.js'),
      'utf8'
    );
    assert.match(src, /Chevron has crashed/);
    assert.ok(src.includes('github.com/builtbygio/chevron/issues'));
    assert.ok(!mentionsAtomRepo(src));
  });

  it('file-recovery dialog names Chevron', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/main-process/file-recovery-service.js'),
      'utf8'
    );
    assert.match(src, /Chevron was saving/);
    assert.match(src, /Chevron couldn't recover/);
    assert.doesNotMatch(src, /Atom was saving/);
  });
});
