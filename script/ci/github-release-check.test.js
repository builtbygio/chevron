'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const {
  normalizeTag,
  compareSemver,
  isNewerRelease,
  pickLatestRelease,
  summarizeRelease
} = require('../../src/main-process/github-release-check');

describe('github-release-check', () => {
  it('strips v prefix', () => {
    assert.strictEqual(normalizeTag('v1.0.0'), '1.0.0');
    assert.strictEqual(normalizeTag('1.0.0'), '1.0.0');
  });

  it('compares semver', () => {
    assert.strictEqual(compareSemver('1.0.1', '1.0.0'), 1);
    assert.strictEqual(compareSemver('1.0.0', '1.0.1'), -1);
    assert.strictEqual(compareSemver('1.0.0', 'v1.0.0'), 0);
  });

  it('detects newer remote tags', () => {
    assert.strictEqual(isNewerRelease('v1.0.1', '1.0.0'), true);
    assert.strictEqual(isNewerRelease('1.0.0', '1.0.0'), false);
    assert.strictEqual(isNewerRelease('0.9.0', '1.0.0'), false);
  });

  it('skips drafts when picking latest', () => {
    const latest = pickLatestRelease([
      { tag_name: 'v1.0.1', draft: true },
      { tag_name: 'v1.0.0', draft: false, prerelease: true, html_url: 'https://example/r' }
    ]);
    assert.strictEqual(latest.tag_name, 'v1.0.0');
    const sum = summarizeRelease(latest);
    assert.strictEqual(sum.tag, '1.0.0');
    assert.strictEqual(sum.prerelease, true);
    assert.strictEqual(sum.htmlUrl, 'https://example/r');
  });
});
