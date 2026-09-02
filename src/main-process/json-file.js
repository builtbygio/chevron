'use strict';

/**
 * Reads the JSON files the editor loads: menus, keymaps, grammars, settings,
 * snippets and package metadata.
 *
 * Replaces `season`, whose only remaining job was JSON. season parses CSON --
 * and caches it, and detects duplicate keys -- solely for `.cson` files; for
 * every other extension its readFileSync is a bare JSON.parse. Nothing in the
 * repository is CSON any more, so that is the whole of what it was doing.
 *
 * Lives under src/main-process/ because src/main-process/main.js is a caller
 * and the main process cannot load .ts (see
 * script/ci/src-typescript-first.test.js). Named json-file rather than
 * config-file: src/config-file.js is the user's config watcher, a different
 * thing entirely.
 */

const fs = require('fs');
const path = require('path');

// season returned null for an empty file rather than throwing, and callers
// lean on that with `|| {}`.
function parse(contents) {
  return contents.trim().length === 0 ? null : JSON.parse(contents);
}

function isObjectPath(objectPath) {
  return objectPath ? path.extname(objectPath) === '.json' : false;
}

// A path with or without its extension; returns the file that exists, or null.
function resolve(objectPath) {
  if (!objectPath) return null;
  if (isObjectPath(objectPath) && isFile(objectPath)) return objectPath;
  const jsonPath = `${objectPath}.json`;
  return isFile(jsonPath) ? jsonPath : null;
}

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch (error) {
    return false;
  }
}

function readFileSync(objectPath, options = {}) {
  // allowDuplicateKeys was season's CSON-only option; accepted and ignored so
  // call sites do not have to change shape.
  const { allowDuplicateKeys, ...fsOptions } = options;
  return parse(
    fs.readFileSync(objectPath, { encoding: 'utf8', ...fsOptions })
  );
}

function readFile(objectPath, options, callback) {
  if (arguments.length < 3) {
    callback = options;
    options = {};
  }
  const { allowDuplicateKeys, ...fsOptions } = options;
  fs.readFile(
    objectPath,
    { encoding: 'utf8', ...fsOptions },
    (error, contents) => {
      if (error) return callback(error);
      let object;
      try {
        object = parse(contents);
      } catch (parseError) {
        return callback(parseError);
      }
      callback(null, object);
    }
  );
}

module.exports = {
  isObjectPath,
  resolve,
  readFileSync,
  readFile
};
