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
var go_back_view_exports = {};
__export(go_back_view_exports, {
  default: () => GoBackView
});
module.exports = __toCommonJS(go_back_view_exports);
var import_symbols_view = __toESM(require("./symbols-view"));
class GoBackView extends import_symbols_view.default {
  toggle() {
    const previousTag = this.stack.pop();
    if (!previousTag) {
      return;
    }
    const restorePosition = () => {
      if (previousTag.position) {
        this.moveToPosition(previousTag.position, false);
      }
    };
    const previousEditor = atom.workspace.getTextEditors().find((e) => e.id === previousTag.editorId);
    if (previousEditor) {
      const pane = atom.workspace.paneForItem(previousEditor);
      pane.setActiveItem(previousEditor);
      restorePosition();
    } else if (previousTag.file) {
      atom.workspace.open(previousTag.file).then(restorePosition);
    }
  }
}
