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

describe('crash branding', () => {
  it('render-process-gone dialog reports to builtbygio/chevron', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/main-process/atom-window.js'),
      'utf8'
    );
    assert.match(src, /Chevron has crashed/);
    assert.match(src, /github\.com\/builtbygio\/chevron\/issues/);
    assert.doesNotMatch(src, /github\.com\/atom\/atom['"]/);
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
