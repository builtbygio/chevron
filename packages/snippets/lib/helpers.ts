declare const atom: any

/** @babel */

import path from 'path'

function getPackageRoot() {
  // Ask the package manager where this package is rather than deriving it from
  // the calling file's position. path.resolve(__dirname, '..') was correct
  // while this file lived in lib/ and wrong the moment the package was bundled
  // into a single index.js at the package root, where it resolved to
  // node_modules/ instead. Nothing threw: loadBundledSnippets looked for
  // <that>/lib/snippets, found nothing, and the package activated with no
  // built-in snippets at all.
  const resolved = chevron.packages.resolvePackagePath('snippets')
  if (resolved) return resolved

  // Snapshot fallback: __dirname is not absolute there, and the package
  // manager may not have resolved paths yet this early.
  const {resourcePath} = chevron.getLoadSettings()
  return path.join(resourcePath, 'node_modules', 'snippets')
}

module.exports = {
  getPackageRoot
}
