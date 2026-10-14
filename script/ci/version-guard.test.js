'use strict';

/**
 * A pull request changes package.json's version only as a release, with the
 * new version's CHANGELOG section.
 *
 * The version moves when a release is cut and every other PR adds to
 * [Unreleased] (docs/reference/releases.md). CI runs the guard on pull
 * requests so a stray bump fails before it merges.
 *
 * Run: node --test script/ci/version-guard.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { versionGuard, checkAgainst } = require('../lib/version-guard');
const { makeTempDir } = require('../lib/temp-dir');

const UNRELEASED = `# Changelog

## [Unreleased]

- A fix.

## [1.2.0] — 2026-09-20

- Older.
## [1.1.0] — 2026-07-20
`;

const RELEASED = UNRELEASED.replace('## [Unreleased]', '## [Unreleased]\n\n## [1.5.0] — 2026-10-13');

describe('versionGuard', () => {
  it('passes when the version is unchanged', () => {
    assert.strictEqual(
      versionGuard({ baseVersion: '1.4.17', headVersion: '1.4.17', changelog: UNRELEASED }),
      null
    );
  });

  it('passes a bump that brings its CHANGELOG section', () => {
    assert.strictEqual(
      versionGuard({ baseVersion: '1.4.17', headVersion: '1.5.0', changelog: RELEASED }),
      null
    );
  });

  it('fails a bump with no section and points to releases.md', () => {
    const problem = versionGuard({ baseVersion: '1.4.17', headVersion: '1.4.18', changelog: UNRELEASED });
    assert.match(problem, /from 1\.4\.17 to 1\.4\.18/);
    assert.match(problem, /no "## \[1\.4\.18\]" section/);
    assert.match(problem, /docs\/reference\/releases\.md/);
  });

  it('fails a bump whose section is empty', () => {
    const changelog = UNRELEASED.replace('## [Unreleased]', '## [1.5.0] — 2026-10-13\n\n## [Unreleased]');
    assert.match(
      versionGuard({ baseVersion: '1.4.17', headVersion: '1.5.0', changelog }),
      /no "## \[1\.5\.0\]" section/
    );
  });

  it('fails a version downgrade', () => {
    assert.strictEqual(
      versionGuard({ baseVersion: '1.4.17', headVersion: '1.1.0', changelog: RELEASED }), null
    );
  });
});

describe('checkAgainst', () => {
  function git(root, ...args) {
    return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      encoding: 'utf8'
    });
  }

  function repo() {
    const root = makeTempDir('version-guard-');
    git(root, 'init', '-q');
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.4.17' }));
    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), UNRELEASED);
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'base');
    return root;
  }

  it('compares the base ref with the working tree', () => {
    const root = repo();
    assert.strictEqual(checkAgainst(root, 'HEAD'), null);

    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.5.0' }));
    assert.match(checkAgainst(root, 'HEAD'), /no "## \[1\.5\.0\]" section/);

    fs.writeFileSync(path.join(root, 'CHANGELOG.md'), RELEASED);
    assert.strictEqual(checkAgainst(root, 'HEAD'), null);
  });
});
