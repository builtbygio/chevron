var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var main_exports = {};
__export(main_exports, {
  activate: () => activate,
  consumeStatusBar: () => consumeStatusBar,
  deactivate: () => deactivate,
  deserializeIncompatiblePackagesComponent: () => deserializeIncompatiblePackagesComponent
});
module.exports = __toCommonJS(main_exports);
var import_atom = require("atom");
var import_view_uri = __toESM(require("./view-uri"));
let disposables = null;
function activate() {
  disposables = new import_atom.CompositeDisposable();
  disposables.add(
    atom.workspace.addOpener((uri) => {
      if (uri === import_view_uri.default) {
        return deserializeIncompatiblePackagesComponent();
      }
    })
  );
  disposables.add(
    atom.commands.add("atom-workspace", {
      "incompatible-packages:view": () => {
        atom.workspace.open(import_view_uri.default);
      }
    })
  );
}
function deactivate() {
  disposables.dispose();
}
function consumeStatusBar(statusBar) {
  let incompatibleCount = 0;
  for (let pack of atom.packages.getLoadedPackages()) {
    if (!pack.isCompatible()) incompatibleCount++;
  }
  if (incompatibleCount > 0) {
    let icon = createIcon(incompatibleCount);
    let tile = statusBar.addRightTile({ item: icon, priority: 200 });
    icon.element.addEventListener("click", () => {
      atom.commands.dispatch(icon.element, "incompatible-packages:view");
    });
    disposables.add(new import_atom.Disposable(() => tile.destroy()));
  }
}
function deserializeIncompatiblePackagesComponent() {
  const IncompatiblePackagesComponent = require("./incompatible-packages-component");
  return new IncompatiblePackagesComponent(atom.packages);
}
function createIcon(count) {
  const StatusIconComponent = require("./status-icon-component");
  return new StatusIconComponent({ count });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  consumeStatusBar,
  deactivate,
  deserializeIncompatiblePackagesComponent
});
