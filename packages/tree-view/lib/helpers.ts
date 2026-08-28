/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const path = require("path");

module.exports = {
  repoForPath(goalPath) {
    const iterable = chevron.project.getPaths();
    for (let i = 0; i < iterable.length; i++) {
      var projectPath = iterable[i];
      if ((goalPath === projectPath) || (goalPath.indexOf(projectPath + path.sep) === 0)) {
        return chevron.project.getRepositories()[i];
      }
    }
    return null;
  },

  getStyleObject(el) {
    const styleProperties = window.getComputedStyle(el);
    const styleObject = {};
    for (var property in styleProperties) {
      var value = styleProperties.getPropertyValue(property);
      var camelizedAttr = property.replace(/\-([a-z])/g, (a, b) => b.toUpperCase());
      styleObject[camelizedAttr] = value;
    }
    return styleObject;
  },

  getFullExtension(filePath) {
    const basename = path.basename(filePath);
    const position = basename.indexOf('.');
    if (position > 0) { return basename.slice(position); } else { return ''; }
  }
};
