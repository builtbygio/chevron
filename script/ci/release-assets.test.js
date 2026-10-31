'use strict';

/**
 * A release carries the Linux packages and nothing else.
 *
 * Run: node --test script/ci/release-assets.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WORKFLOW = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml'),
  'utf8'
);

// The block of lines indented under `key:` that follows `anchor`.
function blockAfter(anchor, key) {
  const lines = WORKFLOW.split('\n');
  const start = lines.findIndex(line => line.includes(anchor));
  assert.ok(start >= 0, `ci.yml has no ${anchor}`);
  const keyAt = lines.findIndex((line, i) => i > start && line.trim().startsWith(`${key}:`));
  const indent = lines[keyAt].search(/\S/);
  const inline = lines[keyAt].slice(lines[keyAt].indexOf(':') + 1).trim();
  const out = inline && inline !== '|' ? [inline] : [];
  for (let i = keyAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() && line.search(/\S/) <= indent) break;
    if (line.trim() && !line.trim().startsWith('#')) out.push(line.trim());
  }
  return out;
}

describe('release assets', () => {
  it('publishes only files at the top of the merged artifacts', () => {
    const files = blockAfter('softprops/action-gh-release', 'files');
    assert.ok(files.length > 0);
    for (const pattern of files) {
      assert.match(pattern, /^artifacts\/[^/]+$/, pattern);
    }
  });

  it('publishes the Linux AppImage only (no macOS or Windows jobs)', () => {
    const files = blockAfter('softprops/action-gh-release', 'files');
    assert.deepEqual(files, ['artifacts/*.AppImage']);
    assert.doesNotMatch(WORKFLOW, /artifacts\/\*\.deb/);
    assert.doesNotMatch(WORKFLOW, /artifacts\/\*\.rpm/);
    assert.doesNotMatch(WORKFLOW, /artifacts\/\*\.tar\.gz/);
    assert.doesNotMatch(WORKFLOW, /--create-debian-package/);
    assert.doesNotMatch(WORKFLOW, /--create-rpm-package/);
    assert.doesNotMatch(WORKFLOW, /build-and-smoke-macos/);
    assert.doesNotMatch(WORKFLOW, /macos-universal/);
    assert.doesNotMatch(WORKFLOW, /build-and-smoke-windows/);
    assert.doesNotMatch(WORKFLOW, /build-and-smoke-linux-arm64/);
    assert.doesNotMatch(WORKFLOW, /ubuntu-24\.04-arm/);
  });
});
