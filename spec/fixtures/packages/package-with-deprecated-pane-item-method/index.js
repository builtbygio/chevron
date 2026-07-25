/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
class TestItem {
  getUri() { return "test"; }
}

exports.activate = () => atom.workspace.addOpener(() => new TestItem);
