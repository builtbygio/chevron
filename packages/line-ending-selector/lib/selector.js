var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
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
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var selector_exports = {};
__export(selector_exports, {
  Selector: () => Selector
});
module.exports = __toCommonJS(selector_exports);
var import_atom_select_list = __toESM(require("atom-select-list"));
var import_atom = require("chevron");
var import_main = require("./main");
class Selector {
  // Make a selector object (should be called once)
  constructor(selectorItems) {
    __publicField(this, "lineEndingListView");
    __publicField(this, "modalPanel");
    __publicField(this, "previousActivePane");
    this.lineEndingListView = new import_atom_select_list.default({
      // an array containing the objects you want to show in the select list
      items: selectorItems,
      // called whenever an item needs to be displayed.
      elementForItem: (lineEnding) => {
        const element = document.createElement("li");
        element.textContent = lineEnding.name;
        return element;
      },
      // called to retrieve a string property on each item and that will be used to filter them.
      filterKeyForItem: (lineEnding) => {
        return lineEnding.name;
      },
      // called when the user clicks or presses Enter on an item. // use `=>` for `this`
      didConfirmSelection: (lineEnding) => {
        const editor = atom.workspace.getActiveTextEditor();
        if (editor instanceof import_atom.TextEditor) {
          (0, import_main.setLineEnding)(editor, lineEnding.value);
        }
        this.hide();
      },
      // called when the user presses Esc or the list loses focus. // use `=>` for `this`
      didCancelSelection: () => {
        this.hide();
      }
    });
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.lineEndingListView
    });
  }
  // Show a selector object
  show() {
    this.previousActivePane = atom.workspace.getActivePane();
    this.lineEndingListView.reset();
    this.modalPanel.show();
    this.lineEndingListView.focus();
  }
  // Hide a selector
  hide() {
    this.modalPanel.hide();
    this.previousActivePane.activate();
  }
  // Dispose selector
  dispose() {
    this.lineEndingListView.destroy();
    this.modalPanel.destroy();
    this.modalPanel = null;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Selector
});
