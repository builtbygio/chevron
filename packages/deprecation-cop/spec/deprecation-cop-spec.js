/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */
const DeprecationCopView = require('../lib/deprecation-cop-view');

describe("DeprecationCop", function() {
  let [activationPromise, workspaceElement] = Array.from([]);

  beforeEach(function() {
    workspaceElement = chevron.views.getView(chevron.workspace);
    activationPromise = chevron.packages.activatePackage('deprecation-cop');
    return expect(chevron.workspace.getActivePane().getActiveItem()).not.toExist();
  });

  describe("when the deprecation-cop:view event is triggered", () => it("displays the deprecation cop pane", function() {
    chevron.commands.dispatch(workspaceElement, 'deprecation-cop:view');

    waitsForPromise(() => activationPromise);

    let deprecationCopView = null;
    waitsFor(() => deprecationCopView = chevron.workspace.getActivePane().getActiveItem());

    return runs(() => expect(deprecationCopView instanceof DeprecationCopView).toBeTruthy());
  }));

  return describe("deactivating the package", () => it("removes the deprecation cop pane item", function() {
    chevron.commands.dispatch(workspaceElement, 'deprecation-cop:view');

    waitsForPromise(() => activationPromise);

    waitsForPromise(() => Promise.resolve(chevron.packages.deactivatePackage('deprecation-cop'))); // Wrapped for Promise & non-Promise deactivate

    return runs(() => expect(chevron.workspace.getActivePane().getActiveItem()).not.toExist());
  }));
});
