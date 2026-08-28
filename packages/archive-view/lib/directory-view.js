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
var directory_view_exports = {};
__export(directory_view_exports, {
  default: () => DirectoryView
});
module.exports = __toCommonJS(directory_view_exports);
var import_atom = require("chevron");
var import_file_view = __toESM(require("./file-view"));
var import_get_icon_services = __toESM(require("./get-icon-services"));
class DirectoryView {
  constructor(parentView, indexInParentView, archivePath, entry) {
    this.disposables = new import_atom.CompositeDisposable();
    this.entries = [];
    this.parentView = parentView;
    this.indexInParentView = indexInParentView;
    this.element = document.createElement("li");
    this.element.classList.add("list-nested-item", "entry");
    const listItem = document.createElement("span");
    listItem.classList.add("list-item");
    const clickHandler = (event) => {
      event.stopPropagation();
      event.preventDefault();
      this.element.classList.toggle("collapsed");
    };
    listItem.addEventListener("click", clickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      listItem.removeEventListener("click", clickHandler);
    }));
    const entrySpan = document.createElement("span");
    entrySpan.textContent = entry.getName();
    listItem.appendChild(entrySpan);
    this.element.appendChild(listItem);
    this.entry = entry;
    this.entrySpan = entrySpan;
    (0, import_get_icon_services.default)().updateDirectoryIcon(this);
    this.entriesTree = document.createElement("ol");
    this.entriesTree.classList.add("list-tree");
    let index = 0;
    for (const child of entry.children) {
      if (child.isDirectory()) {
        const entryView = new DirectoryView(this, index, archivePath, child);
        this.entries.push(entryView);
        this.entriesTree.appendChild(entryView.element);
      } else {
        const entryView = new import_file_view.default(this, index, archivePath, child);
        this.entries.push(entryView);
        this.entriesTree.appendChild(entryView.element);
      }
      index++;
    }
    this.element.appendChild(this.entriesTree);
  }
  destroy() {
    if (this.iconDisposable) {
      this.iconDisposable.dispose();
      this.iconDisposable = null;
    }
    while (this.entries.length > 0) {
      this.entries.pop().destroy();
    }
    this.disposables.dispose();
    this.element.remove();
  }
  selectFileBeforeIndex(index) {
    for (let i = index - 1; i >= 0; i--) {
      const previousEntry = this.entries[i];
      if (previousEntry instanceof import_file_view.default) {
        previousEntry.select();
        return;
      } else {
        if (previousEntry.selectLastFile()) {
          return;
        }
      }
    }
    this.parentView.selectFileBeforeIndex(this.indexInParentView);
  }
  selectFileAfterIndex(index) {
    for (let i = index + 1; i < this.entries.length; i++) {
      const nextEntry = this.entries[i];
      if (nextEntry instanceof import_file_view.default) {
        nextEntry.select();
        return;
      } else {
        if (nextEntry.selectFirstFile()) {
          return;
        }
      }
    }
    this.parentView.selectFileAfterIndex(this.indexInParentView);
  }
  selectFirstFile() {
    for (const entry of this.entries) {
      if (entry instanceof import_file_view.default) {
        entry.select();
        return true;
      } else {
        if (entry.selectFirstFile()) {
          return true;
        }
      }
    }
    return false;
  }
  selectLastFile() {
    for (var i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry instanceof import_file_view.default) {
        entry.select();
        return true;
      } else {
        if (entry.selectLastFile()) {
          return true;
        }
      }
    }
    return false;
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
