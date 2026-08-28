/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
module.exports = {
  activateCallCount: 0,
  openerCount: 0,

  activate() {
    this.activateCallCount++;
    return atom.workspace.addOpener(filePath => {
      if (filePath === 'chevron://fictitious') {
        return this.openerCount++;
      }
    });
  }
};
