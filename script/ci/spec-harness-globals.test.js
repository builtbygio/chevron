'use strict';

/**
 * The Jasmine harness defines `window.chevron` and does not invent `window.atom`.
 * Run: node --test script/ci/spec-harness-globals.test.js
 *
 * Specs and bundled packages call `chevron.*`. The harness builds its own
 * environment, independent of the editor's global. Run 32140370725 failed
 * 37 of 37 suites because `chevron` was undefined in the spec window.
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

  it('does not define window.atom', () => {
    assert.doesNotMatch(runner, /window\.atom\s*=/);
  });
});
