'use strict';

/**
 * Path confinement helpers for atom:// / chevron:// resolution.
 * Kept free of Electron requires so unit tests can load under host Node.
 * See Electron BP P0.1 / atom-protocol-handler.js.
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
 * Strip scheme and query/hash; normalize; reject empty / absolute / still-`..`.
 */
function relativePathFromAtomUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;

  let raw;
  if (url.startsWith('atom://')) {
    raw = url.slice('atom://'.length);
  } else if (url.startsWith('chevron://')) {
    raw = url.slice('chevron://'.length);
  } else {
    raw = url;
  }

  const q = raw.indexOf('?');
  if (q !== -1) raw = raw.slice(0, q);
  const h = raw.indexOf('#');
  if (h !== -1) raw = raw.slice(0, h);

  let relativePath = path.normalize(raw.replace(/\\/g, '/'));
  const parts = relativePath.split(/[/\\]/).filter(p => p && p !== '.');
  if (parts.some(p => p === '..')) return null;
  if (path.isAbsolute(relativePath)) return null;
  if (parts.length === 0) return null;

  return parts.join(path.sep);
}

module.exports = {
  pathContained,
  relativePathFromAtomUrl
};
