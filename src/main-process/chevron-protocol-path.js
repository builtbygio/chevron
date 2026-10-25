'use strict';

/**
 * Path confinement helpers for chevron:// resolution.
 * Kept free of Electron requires so unit tests can load under host Node.
 * See Electron BP P0.1 / chevron-protocol-handler.js.
 */

const path = require('path');

/**
 * True if `target` is `root` or a path strictly inside `root`.
 */
function pathContained(root, target) {
  if (typeof root !== 'string' || typeof target !== 'string') return false;
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(target);
  if (rootResolved === targetResolved) return true;
  const prefix = rootResolved.endsWith(path.sep)
    ? rootResolved
    : rootResolved + path.sep;
  return targetResolved.startsWith(prefix);
}

/**
 * Decode each run of `%XX` escapes as UTF-8, one character at a time, so an
 * escape that is not valid UTF-8 (`%FF`, a stray continuation byte) and a `%`
 * that starts no escape (`50% off`) stay literal without stopping the valid
 * escapes around them from decoding.
 */
function decodeEscapes(raw) {
  return raw.replace(/(?:%[0-9a-fA-F]{2})+/g, run => {
    const escapes = run.match(/%[0-9a-fA-F]{2}/g);
    let decoded = '';
    let i = 0;
    while (i < escapes.length) {
      const lead = parseInt(escapes[i].slice(1), 16);
      const length = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
      try {
        decoded += decodeURIComponent(escapes.slice(i, i + length).join(''));
        i += length;
      } catch (error) {
        decoded += escapes[i];
        i += 1;
      }
    }
    return decoded;
  });
}

/**
 * Strip scheme and query/hash; percent-decode; normalize; reject empty /
 * absolute / still-`..`. Decoding comes before the `..` check, so `%2e%2e`
 * is rejected like `..`.
 */
function relativePathFromChevronUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;

  let raw;
  if (url.startsWith('chevron://')) {
    raw = url.slice('chevron://'.length);
  } else {
    raw = url;
  }

  const q = raw.indexOf('?');
  if (q !== -1) raw = raw.slice(0, q);
  const h = raw.indexOf('#');
  if (h !== -1) raw = raw.slice(0, h);

  raw = decodeEscapes(raw);
  if (raw.includes('\0')) return null;

  let relativePath = path.normalize(raw.replace(/\\/g, '/'));
  const parts = relativePath.split(/[/\\]/).filter(p => p && p !== '.');
  if (parts.some(p => p === '..')) return null;
  if (path.isAbsolute(relativePath)) return null;
  if (parts.length === 0) return null;

  return parts.join(path.sep);
}

module.exports = {
  pathContained,
  relativePathFromChevronUrl
};
