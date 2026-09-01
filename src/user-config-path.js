'use strict';

/**
 * User config / keymap / snippets files are JSON.
 *
 * CSON is no longer read. It was retained to migrate users arriving from
 * Atom, and reading it cost the product a second language's compiler:
 * season -> cson-parser -> coffee-script, 0.38 MB shipped so that a file
 * most users no longer have could be parsed once.
 *
 * A .cson found here is reported, never read and never deleted. Reporting
 * matters: a real Atom config.cson is not JSON -- unquoted keys, indentation
 * instead of braces -- so silently ignoring it would start the user on
 * defaults with their settings sitting in a file on disk, which is the worst
 * of the available behaviours.
 */

const fs = require('fs');
const path = require('path');

const STEMS = ['config', 'keymap', 'snippets'];

// CHEVRON_CONFIG_CSON is gone with the reader: an escape hatch that writes a
// format nothing reads is worse than no escape hatch.

function pathsFor(homeDir, stem) {
  return {
    json: path.join(homeDir, `${stem}.json`),
    cson: path.join(homeDir, `${stem}.cson`)
  };
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function resolveUserDataFile(homeDir, stem) {
  const { json, cson } = pathsFor(homeDir, stem);
  // Always the .json path. An orphaned .cson is surfaced through
  // strandedCsonFiles rather than read.
  return {
    filePath: json,
    format: 'json',
    strandedCson: !exists(json) && exists(cson) ? cson : null
  };
}

// Files the user still has in CSON that nothing will read. The caller decides
// how to tell them; this only reports.
function strandedCsonFiles(homeDir) {
  const stranded = [];
  for (const stem of STEMS) {
    const { json, cson } = pathsFor(homeDir, stem);
    if (!exists(json) && exists(cson)) stranded.push(cson);
  }
  return stranded;
}

function readObjectFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data || {}, null, 2) + '\n');
}

module.exports = {
  strandedCsonFiles,
  resolveUserDataFile,
  readObjectFile,
  writeJsonFile
};
