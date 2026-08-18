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
var diff_list_view_exports = {};
__export(diff_list_view_exports, {
  default: () => DiffListView
});
module.exports = __toCommonJS(diff_list_view_exports);
var import_atom_select_list = __toESM(require("atom-select-list"));
var import_helpers = __toESM(require("./helpers"));
class DiffListView {
  constructor() {
    this.selectListView = new import_atom_select_list.default({
      emptyMessage: "No diffs in file",
      items: [],
      filterKeyForItem: (diff) => diff.lineText,
      elementForItem: (diff) => {
        const li = document.createElement("li");
        li.classList.add("two-lines");
        const primaryLine = document.createElement("div");
        primaryLine.classList.add("primary-line");
        primaryLine.textContent = diff.lineText;
        li.appendChild(primaryLine);
        const secondaryLine = document.createElement("div");
        secondaryLine.classList.add("secondary-line");
        secondaryLine.textContent = `-${diff.oldStart},${diff.oldLines} +${diff.newStart},${diff.newLines}`;
        li.appendChild(secondaryLine);
        return li;
      },
      didConfirmSelection: (diff) => {
        this.cancel();
        const bufferRow = diff.newStart > 0 ? diff.newStart - 1 : diff.newStart;
        this.editor.setCursorBufferPosition([bufferRow, 0], {
          autoscroll: true
        });
        this.editor.moveToFirstCharacterOfLine();
      },
      didCancelSelection: () => {
        this.cancel();
      }
    });
    this.selectListView.element.classList.add("diff-list-view");
    this.panel = chevron.workspace.addModalPanel({
      item: this.selectListView,
      visible: false
    });
  }
  attach() {
    this.previouslyFocusedElement = document.activeElement;
    this.selectListView.reset();
    this.panel.show();
    this.selectListView.focus();
  }
  cancel() {
    this.panel.hide();
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
  }
  destroy() {
    this.cancel();
    this.panel.destroy();
    return this.selectListView.destroy();
  }
  async toggle() {
    const editor = chevron.workspace.getActiveTextEditor();
    if (this.panel.isVisible()) {
      this.cancel();
    } else if (editor) {
      this.editor = editor;
      const repository = await (0, import_helpers.default)(this.editor.getPath());
      let diffs = repository ? repository.getLineDiffs(this.editor.getPath(), this.editor.getText()) : [];
      if (!diffs) diffs = [];
      for (let diff of diffs) {
        const bufferRow = diff.newStart > 0 ? diff.newStart - 1 : diff.newStart;
        const lineText = this.editor.lineTextForBufferRow(bufferRow);
        diff.lineText = lineText ? lineText.trim() : "";
      }
      await this.selectListView.update({ items: diffs });
      this.attach();
    }
  }
}

// Chevron: Node require() interop for default-only esbuild ESM modules
if (module.exports && module.exports.__esModule && module.exports.default != null) {
  var __keys = Object.keys(module.exports).filter(function (k) {
    return k !== '__esModule' && k !== 'default';
  });
  if (__keys.length === 0) {
    module.exports = module.exports.default;
  }
}
