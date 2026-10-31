'use strict';

/**
 * Cutting a release is script/lib/release.js: the bump, the dated CHANGELOG
 * section, and the download pages that name the version.
 *
 * Run: node --test script/ci/release.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { suggest, bumped, prepared, prepareFiles } = require('../lib/release');

const ROOT = path.resolve(__dirname, '..', '..');

const LOG = `# Changelog

Intro.

## [Unreleased]

### Fixed

- a fix

## [1.2.0] — 2026-09-06

### Fixed

- older
`;

const RELEASES = `# Releases

**Status:** 1.2.0 product contract
**Current tag:** [v1.2.0](https://github.com/builtbygio/chevron/releases/tag/v1.2.0)

**1.2.0:** https://github.com/builtbygio/chevron/releases/tag/v1.2.0
Previous: [v1.1.0](https://github.com/builtbygio/chevron/releases/tag/v1.1.0)

| Platform | File |
|----------|------|
| Linux x64 | \`chevron-1.2.0-x64.AppImage\` |
| macOS Intel | \`chevron-mac-x64.zip\` (unsigned \`.app\`) |
| macOS Apple Silicon | \`chevron-mac-arm64.zip\` (unsigned \`.app\`) |
| Windows x64 | \`chevron-x64-windows.zip\` |
`;

const README = `# Chevron

**[1.2.0 unsigned preview](https://github.com/builtbygio/chevron/releases/tag/v1.2.0)**

| Platform | File |
|----------|------|
| macOS Intel | \`chevron-mac-x64.zip\` |
| Windows x64 | \`chevron-x64-windows.zip\` |

**1.2.0 unsigned preview** is the current build.
`;

const GROK = `# GROK

**Date of this handoff:** 2026-10-01 (last tag **v1.2.0**, next release **1.5.0**; still true)

## Current baseline (last tag v1.2.0; next release 1.5.0)

| Version | \`package.json\` reads 1.4.17, left over from an old patch-bump-per-PR rule whose versions were never released (#437). Last published: **v1.2.0** unsigned preview; next release **1.5.0** ([docs/reference/releases.md](docs/reference/releases.md)) |
`;

describe('suggest', () => {
  it('picks the bump from the kinds of entries', () => {
    assert.equal(suggest('### Fixed\n\n- a', '1.4.17').bump, 'patch');
    assert.equal(suggest('### Changed\n\n- a\n\n### Fixed\n\n- b', '1.4.17').bump, 'patch');
    assert.equal(suggest('### Fixed\n\n- a\n\n### Added\n\n- b', '1.4.17').bump, 'minor');
    assert.equal(suggest('### Breaking\n\n- a', '1.4.17').bump, 'major');
    assert.equal(suggest('### Fixed\n\n- **Breaking:** the old names are gone.', '1.4.17').bump, 'major');
    assert.equal(suggest('### Added\n', '1.4.17'), null);
  });

  it('computes the next version', () => {
    assert.deepEqual(
      [bumped('1.4.17', 'patch'), bumped('1.4.17', 'minor'), bumped('1.4.17', 'major'), bumped('1.4.17', '1.5.0')],
      ['1.4.18', '1.5.0', '2.0.0', '1.5.0']
    );
  });
});

describe('prepared', () => {
  it('moves Unreleased under the new version and leaves it empty', () => {
    const out = prepared(LOG, '1.5.0', '2026-10-18');
    assert.match(out, /## \[Unreleased\]\n\n## \[1\.5\.0\] — 2026-10-18\n\n### Fixed\n\n- a fix\n/);
    assert.ok(out.indexOf('[1.5.0]') < out.indexOf('[1.2.0]'));
  });

  it('refuses an empty Unreleased', () => {
    assert.throws(() => prepared(LOG.replace('- a fix', ''), '1.5.0', '2026-10-18'), /Nothing under Unreleased/);
  });
});

describe('prepareFiles', () => {
  const files = {
    changelog: LOG.replace('### Fixed\n\n- a fix', '### Added\n\n- a feature'),
    packageJson: '{ "version": "1.4.17" }\n',
    releases: RELEASES,
    readme: README,
    grok: GROK
  };

  it('cuts the suggested release and retargets the download pages', () => {
    const out = prepareFiles(files, { date: '2026-10-18' });
    assert.equal(out.version, '1.5.0');
    assert.match(out.packageJson, /"version": "1\.5\.0"/);
    assert.match(out.changelog, /## \[1\.5\.0\] — 2026-10-18/);
    assert.match(out.releases, /\*\*Current tag:\*\* \[v1\.5\.0\]/);
    assert.match(out.releases, /\*\*Status:\*\* 1\.5\.0 product contract/);
    assert.match(out.releases, /Previous: \[v1\.2\.0\]/);
    assert.match(out.releases, /chevron-1\.5\.0-x64\.AppImage/);
    assert.doesNotMatch(out.releases, /_amd64\.deb/);
    assert.doesNotMatch(out.releases, /\.rpm/);
    assert.doesNotMatch(out.releases, /\.tar\.gz/);
    assert.doesNotMatch(out.releases, /Linux arm64/);
    assert.doesNotMatch(out.releases, /chevron-mac-/);
    assert.doesNotMatch(out.releases, /windows-x64/);
    assert.match(out.readme, /\[1\.5\.0 unsigned preview\]/);
    assert.match(out.readme, /\*\*1\.5\.0 unsigned preview\*\*/);
    assert.match(out.grok, /2026-10-18 \(last tag \*\*v1\.5\.0\*\*/);
    assert.match(out.grok, /## Current baseline \(last tag v1\.5\.0\)/);
    assert.match(out.grok, /`package.json` reads 1\.5\.0\. Last published: \*\*v1\.5\.0\*\*/);
    assert.doesNotMatch(out.grok, /1\.4\.17/);
    assert.doesNotMatch(out.grok, /next release/);
  });
});

describe('the tree this release leaves behind', () => {
  it('names package.json\'s version as the current release', () => {
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
    const releases = fs.readFileSync(path.join(ROOT, 'docs', 'reference', 'releases.md'), 'utf8');
    const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    const grok = fs.readFileSync(path.join(ROOT, 'GROK.md'), 'utf8');
    assert.match(releases, new RegExp(`\\*\\*Current tag:\\*\\* \\[v${version}\\]`));
    assert.match(releases, new RegExp(`chevron-${version}-x64\\.AppImage`));
    assert.doesNotMatch(releases, /_amd64\.deb/);
    assert.doesNotMatch(releases, /\.rpm/);
    assert.doesNotMatch(releases, /chevron-mac-/);
    assert.doesNotMatch(releases, /windows-x64-setup/);
    assert.match(readme, new RegExp(`\\[${version} unsigned preview\\]`));
    assert.doesNotMatch(readme, /chevron-mac-/);
    assert.doesNotMatch(readme, /windows-x64-setup/);
    assert.match(grok, new RegExp(`last tag \\*\\*v${version}\\*\\*`));
    assert.match(grok, new RegExp('`package.json` reads ' + version.replace(/\./g, '\\.')));
  });
});
