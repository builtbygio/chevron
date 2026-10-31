'use strict';

const fs = require('fs');
const path = require('path');
const { changelogSection } = require('./release-notes');

// The changelog side of a release, plus the download pages that name it.
//
//   node script/lib/release.js suggest
//   node script/lib/release.js prepare [patch|minor|major|x.y.z]
//   node script/lib/release.js notes <version>
//
// The bump follows docs/reference/releases.md: a breaking change is a major,
// anything under Added is a minor, and anything else is a patch.

const root = path.resolve(__dirname, '..', '..');
const FILES = {
  changelog: 'CHANGELOG.md',
  packageJson: 'package.json',
  releases: path.join('docs', 'reference', 'releases.md'),
  readme: 'README.md',
  grok: 'GROK.md'
};

function kinds(body) {
  const found = new Set();
  let current = null;
  for (const line of String(body || '').split('\n')) {
    const heading = line.match(/^### (.+?)\s*$/);
    if (heading) current = heading[1];
    else if (current && /^\s*[-*] \S/.test(line)) found.add(current);
  }
  return found;
}

// An entry that leads with the Breaking label, wherever its heading sits.
function breakingLabel(body) {
  return /^[-*] \*\*Breaking[:.]/m.test(String(body || ''));
}

function suggest(body, version) {
  const found = kinds(body);
  if (found.size === 0) return null;
  if (found.has('Breaking') || breakingLabel(body)) {
    return { bump: 'major', why: 'a breaking change' };
  }
  if (found.has('Added')) return { bump: 'minor', why: 'Added entries' };
  const listed = [...found].join(', ');
  return { bump: 'patch', why: `only ${listed} entries` };
}

function bumped(version, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const [major, minor, patch] = String(version).split('.').map(part => Number(part) || 0);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Not a bump: ${bump}`);
}

function prepared(changelog, next, date) {
  const body = changelogSection(changelog, 'Unreleased');
  if (!body || kinds(body).size === 0) throw new Error('Nothing under Unreleased to release.');
  const lines = changelog.split('\n');
  const start = lines.findIndex(line => line.startsWith('## [Unreleased]'));
  let end = lines.findIndex((line, i) => i > start && line.startsWith('## ['));
  if (end < 0) end = lines.length;
  return [
    ...lines.slice(0, start + 1),
    '',
    `## [${next}] — ${date}`,
    '',
    body,
    '',
    ...lines.slice(end)
  ].join('\n');
}

function setPackageVersion(packageJson, version) {
  const next = packageJson.replace(/"version": "[^"]+"/, `"version": "${version}"`);
  if (next === packageJson) throw new Error('package.json has no "version"');
  return next;
}

function downloadTable(version) {
  return [
    '| Platform | File |',
    '|----------|------|',
    `| Linux x64 | \`chevron_${version}_amd64.deb\`, \`chevron.x86_64.rpm\`, \`chevron-amd64.tar.gz\`, \`chevron-${version}-x64.AppImage\` |`
  ].join('\n');
}

function replaceDownloadTables(markdown, version) {
  return must(
    markdown,
    /\| Platform \| File \|\r?\n\|[-| ]+\|\r?\n(?:\|.*\|\r?\n)*/,
    downloadTable(version) + '\n',
    'download table'
  );
}

function currentTag(releases) {
  const found = releases.match(/\*\*Current tag:\*\* \[v(\d+\.\d+\.\d+)\]/);
  if (!found) throw new Error('docs/reference/releases.md has no current tag');
  return found[1];
}

function updateReleases(markdown, version) {
  const previous = currentTag(markdown);
  let out = must(
    markdown,
    /\*\*Status:\*\* \d+\.\d+\.\d+ product contract/,
    `**Status:** ${version} product contract`,
    'status'
  );
  out = must(
    out,
    /\*\*Current tag:\*\* \[v\d+\.\d+\.\d+\]\([^)]+\)/,
    `**Current tag:** [v${version}](https://github.com/builtbygio/chevron/releases/tag/v${version})`,
    'current tag'
  );
  out = must(
    out,
    new RegExp(
      `\\*\\*${previous.replace(/\./g, '\\.')}:\\*\\* https://github.com/builtbygio/chevron/releases/tag/v${previous.replace(/\./g, '\\.')}`
    ),
    `**${version}:** https://github.com/builtbygio/chevron/releases/tag/v${version}`,
    'release link'
  );
  out = must(
    out,
    /Previous: \[v\d+\.\d+\.\d+\]\([^)]+\)/,
    `Previous: [v${previous}](https://github.com/builtbygio/chevron/releases/tag/v${previous})`,
    'previous release'
  );
  return replaceDownloadTables(out, version);
}

function updateReadme(markdown, version, previous) {
  const esc = previous.replace(/\./g, '\\.');
  let out = must(
    markdown,
    new RegExp(
      `\\*\\*\\[${esc} unsigned preview\\]\\(https://github.com/builtbygio/chevron/releases/tag/v${esc}\\)\\*\\*`
    ),
    `**[${version} unsigned preview](https://github.com/builtbygio/chevron/releases/tag/v${version})**`,
    'README preview link'
  );
  out = must(
    out,
    new RegExp(`\\*\\*${esc} unsigned preview\\*\\*`),
    `**${version} unsigned preview**`,
    'README status'
  );
  return replaceDownloadTables(out, version);
}

function updateGrok(markdown, version, packageFrom, date) {
  let out = must(
    markdown,
    /(\*\*Date of this handoff:\*\*) \d{4}-\d{2}-\d{2} \(last tag \*\*v\d+\.\d+\.\d+\*\*(?:, next release \*\*\d+\.\d+\.\d+\*\*)?/,
    `$1 ${date} (last tag **v${version}**`,
    'handoff date'
  );
  out = must(
    out,
    /## Current baseline \(last tag v\d+\.\d+\.\d+(?:; next release \d+\.\d+\.\d+)?\)/,
    `## Current baseline (last tag v${version})`,
    'baseline heading'
  );
  out = must(
    out,
    new RegExp(
      '`package.json` reads ' + packageFrom.replace(/\./g, '\\.') +
      '(?:, left over from an old patch-bump-per-PR rule whose versions were never released \\(#437\\))?\\. ' +
      'Last published: \\*\\*v\\d+\\.\\d+\\.\\d+\\*\\* unsigned preview' +
      '(?:; next release \\*\\*\\d+\\.\\d+\\.\\d+\\*\\*)?'
    ),
    '`package.json` reads ' + version + '. Last published: **v' + version + '** unsigned preview',
    'version row'
  );
  return out;
}

function must(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Could not update ${label}`);
  return next;
}

function today() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The five release files, rewritten. `bump` overrides the suggestion.
function prepareFiles(files, { bump, date }) {
  const version = JSON.parse(files.packageJson).version;
  const body = changelogSection(files.changelog, 'Unreleased');
  const suggestion = suggest(body, version);
  const chosen = bump || (suggestion && suggestion.bump);
  if (!chosen) throw new Error('Nothing under Unreleased to release.');
  const next = bumped(version, chosen);
  const previous = currentTag(files.releases);
  return {
    version: next,
    why: bump ? `requested ${bump}` : suggestion.why,
    changelog: prepared(files.changelog, next, date),
    packageJson: setPackageVersion(files.packageJson, next),
    releases: updateReleases(files.releases, next),
    readme: updateReadme(files.readme, next, previous),
    grok: updateGrok(files.grok, next, version, date)
  };
}

function readFiles() {
  const files = {};
  for (const [key, rel] of Object.entries(FILES)) {
    files[key] = fs.readFileSync(path.join(root, rel), 'utf8');
  }
  return files;
}

function main() {
  const [command, arg] = process.argv.slice(2);
  const files = readFiles();
  const version = JSON.parse(files.packageJson).version;

  if (command === 'suggest') {
    const suggestion = suggest(changelogSection(files.changelog, 'Unreleased'), version);
    if (!suggestion) {
      console.log(`Nothing under Unreleased: ${version} is current.`);
      return;
    }
    console.log(`${suggestion.bump}: ${version} → ${bumped(version, suggestion.bump)} (${suggestion.why})`);
  } else if (command === 'prepare') {
    const preparedFiles = prepareFiles(files, { bump: arg, date: today() });
    const written = {
      changelog: preparedFiles.changelog,
      packageJson: preparedFiles.packageJson,
      releases: preparedFiles.releases,
      readme: preparedFiles.readme,
      grok: preparedFiles.grok
    };
    for (const [key, text] of Object.entries(written)) {
      fs.writeFileSync(path.join(root, FILES[key]), text);
    }
    const next = preparedFiles.version;
    console.log(`${version} → ${next} (${preparedFiles.why}).`);
    console.log('Updated package.json, CHANGELOG.md, docs/reference/releases.md, README.md, GROK.md.');
    console.log(`Next: merge this as "Release ${next}", then on master:`);
    console.log(`  git switch master && git pull && git tag -a v${next} -m "Chevron ${next}" && git push origin v${next}`);
  } else if (command === 'notes') {
    const body = changelogSection(files.changelog, arg);
    if (!body) throw new Error(`CHANGELOG.md has no entries for ${arg}.`);
    console.log(body);
  } else {
    console.error('usage: release.js suggest | prepare [patch|minor|major|x.y.z] | notes <version>');
    process.exit(2);
  }
}

module.exports = {
  kinds,
  suggest,
  bumped,
  prepared,
  setPackageVersion,
  downloadTable,
  prepareFiles,
  today
};

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
