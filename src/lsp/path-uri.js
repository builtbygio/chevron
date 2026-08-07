'use strict';

const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

function pathToUri(filePath) {
  if (!filePath) return null;
  try {
    return pathToFileURL(path.resolve(filePath)).href;
  } catch (_) {
    return null;
  }
}

function uriToPath(uri) {
  if (!uri || typeof uri !== 'string') return null;
  try {
    if (uri.startsWith('file:')) return fileURLToPath(uri);
  } catch (_) {
    /* fall through */
  }
  return null;
}

module.exports = { pathToUri, uriToPath };
