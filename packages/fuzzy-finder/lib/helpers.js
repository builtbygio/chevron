const path = require('path')

module.exports = {
  repositoryForPath (filePath) {
    const paths = chevron.project.getPaths()
    for (let i = 0; i < paths.length; i++) {
      const projectPath = paths[i]
      if ((filePath === projectPath) || filePath.startsWith(projectPath + path.sep)) {
        return chevron.project.getRepositories()[i]
      }
    }
    return null
  }
}
