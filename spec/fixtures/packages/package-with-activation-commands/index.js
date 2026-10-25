/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
module.exports = {
  activateCallCount: 0,
  activationCommandCallCount: 0,

  activate() {
    this.activateCallCount++;

    return chevron.commands.add('chevron-workspace', 'activation-command', () => {
      return this.activationCommandCallCount++;
    });
  }
};
