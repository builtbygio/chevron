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
var bookmarks_view_exports = {};
__export(bookmarks_view_exports, {
  default: () => BookmarksView
});
module.exports = __toCommonJS(bookmarks_view_exports);
var import_path = __toESM(require("path"));
var import_atom_select_list = __toESM(require("atom-select-list"));
class BookmarksView {
  constructor(editorsBookmarks) {
    this.editorsBookmarks = editorsBookmarks;
    this.selectList = new import_atom_select_list.default({
      emptyMessage: "No bookmarks found",
      items: [],
      filterKeyForItem: (bookmark) => bookmark.filterText,
      didConfirmSelection: ({ editor, marker }) => {
        this.hide();
        editor.setSelectedBufferRange(marker.getBufferRange(), { autoscroll: true });
        atom.workspace.paneForItem(editor).activate();
        atom.workspace.paneForItem(editor).activateItem(editor);
      },
      didCancelSelection: () => {
        this.hide();
      },
      elementForItem: ({ marker, editor }) => {
        const bookmarkStartRow = marker.getStartBufferPosition().row;
        const bookmarkEndRow = marker.getEndBufferPosition().row;
        const bookmarkPath = editor.getPath() ? import_path.default.basename(editor.getPath()) : "untitled";
        let bookmarkLocation = `${bookmarkPath}:${bookmarkStartRow + 1}`;
        if (bookmarkStartRow !== bookmarkEndRow) {
          bookmarkLocation += `-${bookmarkEndRow + 1}`;
        }
        const lineText = editor.lineTextForBufferRow(bookmarkStartRow);
        const li = document.createElement("li");
        li.classList.add("bookmark");
        const primaryLine = document.createElement("div");
        primaryLine.classList.add("primary-line");
        primaryLine.textContent = bookmarkLocation;
        li.appendChild(primaryLine);
        if (lineText) {
          const secondaryLine = document.createElement("div");
          secondaryLine.classList.add("secondary-line", "line-text");
          secondaryLine.textContent = lineText.trim();
          li.appendChild(secondaryLine);
          li.classList.add("two-lines");
        }
        return li;
      }
    });
    this.selectList.element.classList.add("bookmarks-view");
  }
  destroy() {
    this.selectList.destroy();
    this.getModalPanel().destroy();
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
  }
  async show() {
    const bookmarks = [];
    for (const { editor, markerLayer } of this.editorsBookmarks) {
      for (const marker of markerLayer.getMarkers()) {
        let filterText = `${marker.getStartBufferPosition().row}`;
        if (editor.getPath()) {
          filterText += ` ${editor.getPath()}`;
        }
        const bookmarkedLineText = editor.lineTextForBufferRow(marker.getStartBufferPosition().row);
        if (bookmarkedLineText) {
          filterText += ` ${bookmarkedLineText.trim()}`;
        }
        bookmarks.push({ marker, editor, filterText });
      }
    }
    this.previouslyFocusedElement = document.activeElement;
    this.selectList.reset();
    await this.selectList.update({ items: bookmarks });
    this.getModalPanel().show();
    this.selectList.focus();
  }
  hide() {
    this.getModalPanel().hide();
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
  }
  getModalPanel() {
    if (!this.modalPanel) {
      this.modalPanel = atom.workspace.addModalPanel({ item: this.selectList });
    }
    return this.modalPanel;
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
