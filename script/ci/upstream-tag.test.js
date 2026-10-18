'use strict';

/**
 * The package-spec restore picks the highest upstream tag at or below the
 * vendored version. A string compare treats 0.37.8 as newer than 0.37.10
 * and used to restore an older CoffeeScript tag.
 *
 * Run: node --test script/ci/upstream-tag.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const { bestTag } = require('../lib/upstream-tag');

describe('bestTag', () => {
  it('picks 0.37.8 over 0.37.1 when the vendored version is 0.37.10', () => {
    assert.strictEqual(
      bestTag(['v0.37.1-1', 'v0.37.8', 'v0.37.11'], '0.37.10'),
      '0.37.8'
    );
  });

  it('picks 0.8.8 over 0.8.1 when the vendored version is 0.8.10', () => {
    assert.strictEqual(bestTag(['v0.8.1', 'v0.8.8', 'v0.8.11'], '0.8.10'), '0.8.8');
  });

  it('keeps an exact tag', () => {
    assert.strictEqual(bestTag(['v0.37.8', 'v0.37.10'], '0.37.10'), '0.37.10');
  });

  it('ranks a release above its prerelease', () => {
    assert.strictEqual(bestTag(['v0.37.1-1', 'v0.37.1'], '0.37.1'), '0.37.1');
    assert.strictEqual(bestTag(['v0.37.1-0', 'v0.37.1-1', 'v0.37.2'], '0.37.1'), '0.37.1-1');
  });

  it('returns empty when every tag is newer', () => {
    assert.strictEqual(bestTag(['v1.0.0'], '0.9.0'), '');
  });
});
