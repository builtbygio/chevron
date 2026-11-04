'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @electron/packager 20 copies with fs.cp and dereference:false, but without
 * verbatimSymlinks. Node then stores each symlink as an absolute path back at
 * the source tree. @electron/asar 4 rejects those as links out of the package,
 * including dugite's git-core helpers, which must stay symlinks.
 *
 * Point any of those links at the same path inside the copied tree, as a
 * relative symlink. Links that were already inside the copy, and links that
 * point outside both trees, are left alone.
 */
function retargetCopiedSymlinks(buildPath, sourceRoot) {
  const dest = path.resolve(buildPath);
  const source = path.resolve(sourceRoot);
  walk(dest, dest, source);
}

function walk(dir, dest, source) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      retargetOne(full, dest, source);
    } else if (entry.isDirectory()) {
      walk(full, dest, source);
    }
  }
}

function retargetOne(full, dest, source) {
  const raw = fs.readlinkSync(full);
  const resolved = path.resolve(path.dirname(full), raw);
  let mapped = null;
  if (isInside(dest, resolved)) {
    mapped = resolved;
  } else if (isInside(source, resolved)) {
    mapped = path.join(dest, path.relative(source, resolved));
  }
  if (!mapped) return;
  const next = path.relative(path.dirname(full), mapped);
  if (next === raw) return;
  fs.unlinkSync(full);
  fs.symlinkSync(next, full);
}

function isInside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

module.exports = { retargetCopiedSymlinks };
