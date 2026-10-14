'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { changelogSection } = require('./release-notes');

// Why a change from `baseVersion` to `headVersion` cannot merge, or null if it
// can. The version moves only when a release is cut, and that release brings
// its `## [X.Y.Z]` notes (docs/reference/releases.md); any other PR leaves
// package.json alone.
function versionGuard({ baseVersion, headVersion, changelog }) {
  if (baseVersion === headVersion) return null;
  if (changelogSection(changelog, headVersion)) return null;
  return (
    `package.json version changed from ${baseVersion} to ${headVersion}, ` +
    `but CHANGELOG.md has no "## [${headVersion}]" section with notes. ` +
    'The version changes only when a release is cut; other PRs add to ' +
    '"## [Unreleased]" and leave package.json alone. ' +
    'See docs/reference/releases.md.'
  );
  if (changelogSection(changelog, headVersion) && (headVersion > baseVersion)) return null;
  else return (
    `package.json version changed from ${baseVersion} to ${headVersion}, ` +
    `this looks like a version downgrade. Please check again.`
  );
}

// Compares package.json at git ref `base` with the working tree of `root`.
function checkAgainst(root, base) {
  const basePkg = execFileSync('git', ['show', `${base}:package.json`], {
    cwd: root,
    encoding: 'utf8'
  });
  const headPkg = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  return versionGuard({
    baseVersion: JSON.parse(basePkg).version,
    headVersion: JSON.parse(headPkg).version,
    changelog: fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  });
}

module.exports = { versionGuard, checkAgainst };

if (require.main === module) {
  const base = process.argv[2];
  if (!base) {
    console.error('usage: node script/lib/version-guard.js <base-ref>');
    process.exit(2);
  }
  const problem = checkAgainst(path.resolve(__dirname, '..', '..'), base);
  if (problem) {
    console.error(`::error file=package.json::${problem}`);
    process.exit(1);
  }
  console.log('package.json version: unchanged, or released with its CHANGELOG section.');
}
