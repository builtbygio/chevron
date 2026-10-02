'use strict';

/**
 * A release's notes are its CHANGELOG section, and its tag matches
 * package.json.
 *
 * The version moves only when a release is cut, and every bump is tagged
 * (docs/reference/releases.md). The publish job fails rather than ship a tag
 * whose version or notes are missing.
 *
 * Run: node --test script/ci/release-notes.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { changelogSection, releaseNotes } = require('../lib/release-notes');
const { makeTempDir } = require('../lib/temp-dir');

const CHANGELOG = `# Changelog

## [Unreleased]

### Fixed

- Not yet.

## [1.5.0] — 2026-10-03

### Added

- A feature.

## [1.4.0] — 2026-09-30

- Older.
`;

function repo(version) {
  const root = makeTempDir('release-notes-');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), CHANGELOG);
  return root;
}

describe('changelogSection', () => {
  it('returns the body up to the next version', () => {
    assert.strictEqual(changelogSection(CHANGELOG, '1.5.0'), '### Added\n\n- A feature.');
  });

  it('does not match a longer version with the same prefix', () => {
    assert.strictEqual(changelogSection('## [1.5.01]\n\nx\n', '1.5.0'), null);
  });

  it('returns null for a missing version', () => {
    assert.strictEqual(changelogSection(CHANGELOG, '9.9.9'), null);
  });
});

describe('releaseNotes', () => {
  it('reads the tagged version', () => {
    assert.match(releaseNotes(repo('1.5.0'), 'v1.5.0'), /A feature/);
  });

  it('refuses a tag that does not match package.json', () => {
    assert.throws(() => releaseNotes(repo('1.4.17'), 'v1.5.0'), /does not match package.json/);
  });

  it('refuses a version with no CHANGELOG section', () => {
    assert.throws(() => releaseNotes(repo('1.6.0'), 'v1.6.0'), /no "## \[1\.6\.0\]" section/);
  });

  it('finds every released version in the real CHANGELOG', () => {
    const changelog = fs.readFileSync(path.resolve(__dirname, '..', '..', 'CHANGELOG.md'), 'utf8');
    for (const v of ['1.2.0', '1.1.0', '1.0.1', '1.0.0']) {
      assert.ok(changelogSection(changelog, v), v);
    }
  });
});
