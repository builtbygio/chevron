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
var go_to_view_exports = {};
__export(go_to_view_exports, {
  default: () => GoToView
});
module.exports = __toCommonJS(go_to_view_exports);
var import_path = __toESM(require("path"));
var import_symbols_view = __toESM(require("./symbols-view"));
var import_tag_reader = __toESM(require("./tag-reader"));
class GoToView extends import_symbols_view.default {
  toggle() {
    if (this.panel.isVisible()) {
      this.cancel();
    } else {
      this.populate();
    }
  }
  detached() {
    if (this.resolveFindTagPromise) {
      this.resolveFindTagPromise([]);
    }
  }
  findTag(editor) {
    if (this.resolveFindTagPromise) {
      this.resolveFindTagPromise([]);
    }
    return new Promise((resolve, reject) => {
      this.resolveFindTagPromise = resolve;
      import_tag_reader.default.find(editor, (error, matches) => {
        if (!matches) {
          matches = [];
        }
        if (error) {
          return reject(error);
        } else {
          return resolve(matches);
        }
      });
    });
  }
  async populate() {
    let editor = atom.workspace.getActiveTextEditor();
    if (!editor) {
      return;
    }
    this.findTag(editor).then(async (matches) => {
      let tags = [];
      for (let match of Array.from(matches)) {
        let position = this.getTagLine(match);
        if (!position) {
          continue;
        }
        match.name = import_path.default.basename(match.file);
        tags.push(match);
      }
      if (tags.length === 1) {
        this.openTag(tags[0]);
      } else if (tags.length > 0) {
        await this.selectListView.update({ items: tags });
        this.attach();
      }
    });
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
