declare const atom: any

/** @babel */

import path from 'path'

function getPackageRoot() {
  const {resourcePath} = chevron.getLoadSettings()
  const currentFileWasRequiredFromSnapshot = !path.isAbsolute(__dirname)
  if (currentFileWasRequiredFromSnapshot) {
    return path.join(resourcePath, 'node_modules', 'snippets')
  } else {
    return path.resolve(__dirname, '..')
  }
}

module.exports = {
  getPackageRoot
}
