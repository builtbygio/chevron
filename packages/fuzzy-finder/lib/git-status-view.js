const path = require('path')

const FuzzyFinderView = require('./fuzzy-finder-view')

module.exports =
class GitStatusView extends FuzzyFinderView {
  async toggle () {
    if (this.panel && this.panel.isVisible()) {
      this.cancel()
    } else if (chevron.project.getRepositories().some((repo) => repo)) {
      const paths = []
      for (const repo of chevron.project.getRepositories()) {
        if (repo) {
          const workingDirectory = repo.getWorkingDirectory()
          for (let filePath in repo.statuses) {
            filePath = path.join(workingDirectory, filePath)
            if (chevron.applicationDelegate.isFileSync(filePath)) {
              paths.push(filePath)
            }
          }
        }
      }
      this.show()
      await this.setItems(this.projectRelativePathsForFilePaths(paths))
    }
  }

  getEmptyMessage () {
    return 'Nothing to commit, working directory clean'
  }
}
