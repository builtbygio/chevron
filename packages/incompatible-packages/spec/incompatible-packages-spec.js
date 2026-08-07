var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_path = __toESM(require("path"));
var import_incompatible_packages_component = __toESM(require("../lib/incompatible-packages-component"));
var import_status_icon_component = __toESM(require("../lib/status-icon-component"));
function findStatusBar() {
  if (typeof atom.workspace.getFooterPanels === "function") {
    const footerPanels = atom.workspace.getFooterPanels();
    if (footerPanels.length > 0) {
      return footerPanels[0].getItem();
    }
  }
  return atom.workspace.getBottomPanels()[0].getItem();
}
describe("Incompatible packages", () => {
  let statusBar;
  beforeEach(() => {
    atom.views.getView(atom.workspace);
    waitsForPromise(() => atom.packages.activatePackage("status-bar"));
    runs(() => {
      statusBar = findStatusBar();
    });
  });
  describe("when there are packages with incompatible native modules", () => {
    beforeEach(() => {
      let incompatiblePackage = atom.packages.loadPackage(
        import_path.default.join(__dirname, "fixtures", "incompatible-package")
      );
      spyOn(incompatiblePackage, "isCompatible").andReturn(false);
      incompatiblePackage.incompatibleModules = [];
      waitsForPromise(
        () => atom.packages.activatePackage("incompatible-packages")
      );
      waits(1);
    });
    it("adds an icon to the status bar", () => {
      let statusBarIcon = statusBar.getRightTiles()[0].getItem();
      expect(statusBarIcon.constructor).toBe(import_status_icon_component.default);
    });
    describe("clicking the icon", () => {
      it("displays the incompatible packages view in a pane", () => {
        let statusBarIcon = statusBar.getRightTiles()[0].getItem();
        statusBarIcon.element.dispatchEvent(new MouseEvent("click"));
        let activePaneItem;
        waitsFor(() => activePaneItem = atom.workspace.getActivePaneItem());
        runs(() => {
          expect(activePaneItem.constructor).toBe(
            import_incompatible_packages_component.default
          );
        });
      });
    });
  });
  describe("when there are no packages with incompatible native modules", () => {
    beforeEach(() => {
      waitsForPromise(
        () => atom.packages.activatePackage("incompatible-packages")
      );
    });
    it("does not add an icon to the status bar", () => {
      let statusBarItemClasses = statusBar.getRightTiles().map((tile) => tile.getItem().className);
      expect(statusBarItemClasses).not.toContain("incompatible-packages");
    });
  });
});
