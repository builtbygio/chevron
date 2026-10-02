'use strict';

/**
 * A Jasmine suite that exits 0 passes only if its output says so.
 *
 * script/test trusted the exit code alone; a retried run that exited 0
 * turned a shard green over failures that cannot pass.
 *
 * Run: node --test script/ci/jasmine-summary.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const { jasmineSummaryProblem } = require('../lib/jasmine-summary');

describe('jasmineSummaryProblem', () => {
  it('passes a clean summary', () => {
    assert.strictEqual(
      jasmineSummaryProblem('....\n\nFinished in 1.2 seconds\n233 tests, 866 assertions, 0 failures, 0 skipped\n'),
      null
    );
  });

  it('reads singular forms', () => {
    assert.strictEqual(jasmineSummaryProblem('1 test, 1 assertion, 0 failures, 0 skipped'), null);
    assert.match(jasmineSummaryProblem('1 test, 1 assertion, 1 failure, 0 skipped'), /1 failures/);
  });

  it('fails output with no summary', () => {
    assert.match(jasmineSummaryProblem('Outputting JUnit XML to <x>\n...'), /no Jasmine summary/);
  });

  it('fails a summary with failures', () => {
    assert.match(jasmineSummaryProblem('233 tests, 866 assertions, 18 failures, 0 skipped'), /18 failures/);
  });

  it('fails a run with no specs', () => {
    assert.match(jasmineSummaryProblem('0 tests, 0 assertions, 0 failures, 0 skipped'), /no specs/);
  });

  it('passes a run whose specs were all skipped on this platform', () => {
    assert.strictEqual(jasmineSummaryProblem('0 tests, 0 assertions, 0 failures, 8 skipped'), null);
  });

  it('uses the last summary when there are several', () => {
    assert.strictEqual(
      jasmineSummaryProblem('3 tests, 3 assertions, 1 failure, 0 skipped\n...\n3 tests, 3 assertions, 0 failures, 0 skipped'),
      null
    );
  });
});
