'use strict';

/**
 * app-update.yml: the file electron-updater reads to find the GitHub Releases
 * feed, written next to the app by packaging. Flat `key: value` lines only, so
 * src/main-process/update-config.js can read it back without a YAML parser.
 *
 * `codeSigned` is Chevron's own key: packaging writes false, and the signing
 * step flips it to true before codesign seals the bundle. The main process
 * uses it to keep an unsigned macOS build on the download page, because
 * Squirrel.Mac refuses unsigned updates.
 *
 * docs/reference/auto-update.md
 */

const fs = require('fs');
const path = require('path');

const FILE_NAME = 'app-update.yml';
const UPDATER_CACHE_DIR_NAME = 'chevron-updater';

function githubRepoFromUrl(url) {
  const match = /github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?\/?$/.exec(
    String(url || '')
  );
  return match ? { owner: match[1], repo: match[2] } : null;
}

function yamlScalar(value) {
  if (typeof value === 'boolean') return String(value);
  const text = String(value);
  return /^[A-Za-z0-9._-]+$/.test(text) ? text : JSON.stringify(text);
}

function buildUpdateConfig({
  owner,
  repo,
  codeSigned = false,
  publisherName = null,
  updaterCacheDirName = UPDATER_CACHE_DIR_NAME
}) {
  if (!owner || !repo)
    throw new Error('app-update.yml needs the GitHub owner and repo');
  const lines = [
    `provider: github`,
    `owner: ${yamlScalar(owner)}`,
    `repo: ${yamlScalar(repo)}`,
    `updaterCacheDirName: ${yamlScalar(updaterCacheDirName)}`,
    `codeSigned: ${yamlScalar(!!codeSigned)}`
  ];
  if (publisherName) lines.push(`publisherName: ${yamlScalar(publisherName)}`);
  return lines.join('\n') + '\n';
}

function parseUpdateConfig(text) {
  const result = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    let value = match[2];
    if (value.startsWith('"')) value = JSON.parse(value);
    else if (value === 'true' || value === 'false') value = value === 'true';
    result[match[1]] = value;
  }
  return result;
}

function writeUpdateConfig(resourcesPath, options) {
  const file = path.join(resourcesPath, FILE_NAME);
  fs.mkdirSync(resourcesPath, { recursive: true });
  fs.writeFileSync(file, buildUpdateConfig(options));
  return file;
}

// Rewrite the file inside a bundle as signed. Must run before codesign: the
// file is under Resources, which the signature seals.
function markUpdateConfigSigned(resourcesPath, { publisherName } = {}) {
  const file = path.join(resourcesPath, FILE_NAME);
  const current = parseUpdateConfig(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(
    file,
    buildUpdateConfig({
      ...current,
      codeSigned: true,
      publisherName: publisherName || current.publisherName
    })
  );
  return file;
}

module.exports = {
  FILE_NAME,
  UPDATER_CACHE_DIR_NAME,
  githubRepoFromUrl,
  buildUpdateConfig,
  parseUpdateConfig,
  writeUpdateConfig,
  markUpdateConfigSigned
};
