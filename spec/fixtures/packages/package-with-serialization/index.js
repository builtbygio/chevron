/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
module.exports = {
  activate({someNumber}) {
    this.someNumber = someNumber;
    return this.someNumber != null ? this.someNumber : (this.someNumber = 1);
  },

  serialize() {
    return {someNumber: this.someNumber};
  }
};
