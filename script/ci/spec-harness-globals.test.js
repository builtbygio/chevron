'use strict';

/**
 * The Jasmine harness must define both product globals.
 * Run: node --test script/ci/spec-harness-globals.test.js
 *
 * Bundled package code calls `chevron.*` after the H3 PR 23 conversion, while
 * the existing specs still say `atom.*`. The harness builds its own
 * environment, independent of the editor's global, so if it defines only one
 * name every package suite dies on the first activatePackage.
 *
 * This is not hypothetical: run 32140370725 failed 37 of 37 suites — most of
 * them 100% of their tests — because `chevron` was undefined in the spec
 * window.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const runner = fs.readFileSync(
  path.join(ROOT, 'spec/jasmine-test-runner.js'),
  'utf8'
);

describe('spec harness globals', () => {
  it('defines window.chevron', () => {
    assert.match(runner, /window\.chevron\s*=/);
  });

  it('still defines window.atom for the existing specs', () => {
    // ~7500 `atom.` references live under spec/ and packages/*/spec.
    // Converting them is a separate question; until then both must resolve.
    assert.match(runner, /window\.atom\s*=/);
  });

  it('both names point at the same environment', () => {
    const chev = runner.match(/window\.chevron\s*=\s*(\w+)/);
    const atom = runner.match(/window\.atom\s*=\s*(\w+)/);
    assert.ok(chev && atom, 'both assignments should bind a named environment');
    assert.strictEqual(
      chev[1],
      atom[1],
      'the two globals must be the same object, not two environments'
    );
  });
});
