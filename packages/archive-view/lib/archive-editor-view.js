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
var archive_editor_view_exports = {};
__export(archive_editor_view_exports, {
  default: () => ArchiveEditorView
});
module.exports = __toCommonJS(archive_editor_view_exports);
var import_fs_plus = __toESM(require("fs-plus"));
var import_humanize_plus = __toESM(require("humanize-plus"));
var import_ls_archive = __toESM(require("ls-archive"));
var import_atom = require("chevron");
var import_etch = __toESM(require("etch"));
var import_file_view = __toESM(require("./file-view"));
var import_directory_view = __toESM(require("./directory-view"));
class ArchiveEditorView {
  constructor(archivePath) {
    this.disposables = new import_atom.CompositeDisposable();
    this.emitter = new import_atom.Emitter();
    this.path = archivePath;
    this.file = new import_atom.File(this.path);
    this.entries = [];
    import_etch.default.initialize(this);
    this.refresh();
    this.disposables.add(this.file.onDidChange(() => this.refresh()));
    this.disposables.add(this.file.onDidRename(() => this.refresh()));
    this.disposables.add(this.file.onDidDelete(() => this.destroy()));
    const focusHandler = () => this.focusSelectedFile();
    this.element.addEventListener("focus", focusHandler);
    this.disposables.add(new import_atom.Disposable(() => this.element.removeEventListener("focus", focusHandler)));
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "archive-editor", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "archive-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "loadingMessage", className: "padded icon icon-hourglass text-info" }, `Loading archive…`), /* @__PURE__ */ import_etch.default.dom("div", { ref: "errorMessage", className: "padded icon icon-alert text-error" }), /* @__PURE__ */ import_etch.default.dom("div", { className: "inset-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "summary", className: "panel-heading" }), /* @__PURE__ */ import_etch.default.dom("ol", { ref: "tree", className: "archive-tree padded list-tree has-collapsable-children" }))));
  }
  copy() {
    return new ArchiveEditorView(this.path);
  }
  destroy() {
    while (this.entries.length > 0) {
      this.entries.pop().destroy();
    }
    this.disposables.dispose();
    this.emitter.emit("did-destroy");
    import_etch.default.destroy(this);
  }
  onDidDestroy(callback) {
    return this.emitter.on("did-destroy", callback);
  }
  onDidChangeTitle(callback) {
    return this.emitter.on("did-change-title", callback);
  }
  serialize() {
    return {
      deserializer: this.constructor.name,
      path: this.path
    };
  }
  getPath() {
    return this.file.getPath();
  }
  getTitle() {
    return this.path ? this.file.getBaseName() : "untitled";
  }
  getURI() {
    return this.path;
  }
  refresh() {
    this.refs.summary.style.display = "none";
    this.refs.tree.style.display = "none";
    this.refs.loadingMessage.style.display = "";
    this.refs.errorMessage.style.display = "none";
    if (this.path !== this.getPath()) {
      this.path = this.getPath();
      this.emitter.emit("did-change-title");
    }
    const originalPath = this.path;
    import_ls_archive.default.list(this.path, { tree: true }, (error, entries) => {
      if (originalPath !== this.path) {
        return;
      }
      if (error != null) {
        let message = "Reading the archive file failed";
        if (error.message) {
          message += `: ${error.message}`;
        }
        this.refs.errorMessage.style.display = "";
        this.refs.errorMessage.textContent = message;
      } else {
        this.createTreeEntries(entries);
        this.updateSummary();
      }
      this.refs.loadingMessage.style.display = "none";
    });
  }
  createTreeEntries(entries) {
    while (this.entries.length > 0) {
      this.entries.pop().destroy();
    }
    let index = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const entryView = new import_directory_view.default(this, index, this.path, entry);
        this.entries.push(entryView);
      } else {
        const entryView = new import_file_view.default(this, index, this.path, entry);
        this.entries.push(entryView);
      }
      index++;
    }
    this.selectFileAfterIndex(-1);
    for (const entry of this.entries) {
      this.refs.tree.appendChild(entry.element);
    }
    this.refs.tree.style.display = "";
  }
  updateSummary() {
    const fileCount = this.entries.filter((entry) => entry instanceof import_file_view.default).length;
    const fileLabel = fileCount === 1 ? "1 file" : `${import_humanize_plus.default.intComma(fileCount)} files`;
    const directoryCount = this.entries.filter((entry) => entry instanceof import_directory_view.default).length;
    const directoryLabel = directoryCount === 1 ? "1 folder" : `${import_humanize_plus.default.intComma(directoryCount)} folders`;
    this.refs.summary.style.display = "";
    this.refs.summary.textContent = `${import_humanize_plus.default.fileSize(import_fs_plus.default.getSizeSync(this.path))} with ${fileLabel} and ${directoryLabel}`;
  }
  focusSelectedFile() {
    const selectedFile = this.refs.tree.querySelector(".selected");
    if (selectedFile) {
      selectedFile.focus();
    }
  }
  selectFileBeforeIndex(index) {
    for (let i = index - 1; i >= 0; i--) {
      const previousEntry = this.entries[i];
      if (previousEntry instanceof import_file_view.default) {
        previousEntry.select();
        break;
      } else {
        if (previousEntry.selectLastFile()) {
          break;
        }
      }
    }
  }
  selectFileAfterIndex(index) {
    for (let i = index + 1; i < this.entries.length; i++) {
      const nextEntry = this.entries[i];
      if (nextEntry instanceof import_file_view.default) {
        nextEntry.select();
        break;
      } else {
        if (nextEntry.selectFirstFile()) {
          break;
        }
      }
    }
  }
  focus() {
    this.focusSelectedFile();
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
