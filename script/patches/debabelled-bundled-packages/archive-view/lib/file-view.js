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
var file_view_exports = {};
__export(file_view_exports, {
  default: () => FileView
});
module.exports = __toCommonJS(file_view_exports);
var import_atom = require("atom");
var import_path = __toESM(require("path"));
var import_fs_plus = __toESM(require("fs-plus"));
var import_temp = __toESM(require("temp"));
var import_ls_archive = __toESM(require("ls-archive"));
var import_get_icon_services = __toESM(require("./get-icon-services"));
class FileView {
  constructor(parentView, indexInParentView, archivePath, entry) {
    this.disposables = new import_atom.CompositeDisposable();
    this.parentView = parentView;
    this.indexInParentView = indexInParentView;
    this.archivePath = archivePath;
    this.entry = entry;
    this.element = document.createElement("li");
    this.element.classList.add("list-item", "entry");
    this.element.tabIndex = -1;
    this.name = document.createElement("span");
    (0, import_get_icon_services.default)().updateFileIcon(this);
    this.name.textContent = this.entry.getName();
    this.element.appendChild(this.name);
    const clickHandler = () => {
      this.select();
      this.openFile();
    };
    this.element.addEventListener("click", clickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.element.removeEventListener("click", clickHandler);
    }));
    this.disposables.add(atom.commands.add(this.element, {
      "core:confirm": () => {
        if (this.isSelected()) {
          this.openFile();
        }
      },
      "core:move-down": () => {
        if (this.isSelected()) {
          this.parentView.selectFileAfterIndex(this.indexInParentView);
        }
      },
      "core:move-up": () => {
        if (this.isSelected()) {
          this.parentView.selectFileBeforeIndex(this.indexInParentView);
        }
      }
    }));
  }
  destroy() {
    this.disposables.dispose();
    this.element.remove();
  }
  isSelected() {
    return this.element.classList.contains("selected");
  }
  logError(message, error) {
    console.error(message, error.stack != null ? error.stack : error);
  }
  openFile() {
    import_ls_archive.default.readFile(this.archivePath, this.entry.getPath(), (error, contents) => {
      if (error != null) {
        this.logError(`Error reading: ${this.entry.getPath()} from ${this.archivePath}`, error);
      } else {
        import_temp.default.mkdir("atom-", (error2, tempDirPath) => {
          if (error2 != null) {
            this.logError(`Error creating temp directory: ${tempDirPath}`, error2);
          } else {
            const tempFilePath = import_path.default.join(tempDirPath, import_path.default.basename(this.archivePath), this.entry.getName());
            import_fs_plus.default.writeFile(tempFilePath, contents, (error3) => {
              if (error3 != null) {
                return this.logError(`Error writing to ${tempFilePath}`, error3);
              } else {
                return atom.workspace.open(tempFilePath);
              }
            });
          }
        });
      }
    });
  }
  select() {
    this.element.focus();
    const archiveEditorElement = this.element.closest(".archive-editor");
    if (archiveEditorElement) {
      for (const selected of archiveEditorElement.querySelectorAll(".selected")) {
        selected.classList.remove("selected");
      }
    }
    this.element.classList.add("selected");
  }
}
