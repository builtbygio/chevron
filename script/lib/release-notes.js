'use strict';

const fs = require('fs');
const path = require('path');

// The body of `## [X.Y.Z]` in CHANGELOG.md, without its heading.
function changelogSection(changelog, version) {
  const lines = changelog.split('\n');
  const heading = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\](\\s|$)`);
  const start = lines.findIndex(line => heading.test(line));
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && /^## \[/.test(line));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

// Release notes for tag `vX.Y.Z`: the version's CHANGELOG section. Throws if
// the tag does not match package.json or the CHANGELOG has no such section,
// so a release cannot go out without its version bump and notes.
function releaseNotes(root, tag) {
  const version = String(tag).replace(/^v/, '');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== version) {
    throw new Error(`tag ${tag} does not match package.json version ${pkg.version}`);
  }
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const section = changelogSection(changelog, version);
  if (!section) throw new Error(`CHANGELOG.md has no "## [${version}]" section`);
  return section;
}

module.exports = { changelogSection, releaseNotes };

if (require.main === module) {
  process.stdout.write(releaseNotes(path.resolve(__dirname, '..', '..'), process.argv[2]) + '\n');
}
