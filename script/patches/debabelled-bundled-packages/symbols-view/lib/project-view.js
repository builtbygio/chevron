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
var project_view_exports = {};
__export(project_view_exports, {
  default: () => ProjectView
});
module.exports = __toCommonJS(project_view_exports);
var import_atom = require("atom");
var import_humanize_plus = __toESM(require("humanize-plus"));
var import_symbols_view = __toESM(require("./symbols-view"));
var import_tag_reader = __toESM(require("./tag-reader"));
var import_get_tags_file = __toESM(require("./get-tags-file"));
class ProjectView extends import_symbols_view.default {
  constructor(stack) {
    super(stack, "Project has no tags file or it is empty", 10);
    this.reloadTags = true;
  }
  destroy() {
    this.stopTask();
    this.unwatchTagsFiles();
    return super.destroy();
  }
  toggle() {
    if (this.panel.isVisible()) {
      this.cancel();
    } else {
      this.populate();
      this.attach();
    }
  }
  async populate() {
    if (this.tags) {
      await this.selectListView.update({ items: this.tags });
    }
    if (this.reloadTags) {
      this.reloadTags = false;
      this.startTask();
      if (this.tags) {
        await this.selectListView.update({
          loadingMessage: "Reloading project symbols…"
        });
      } else {
        await this.selectListView.update({
          loadingMessage: "Loading project symbols…",
          loadingBadge: 0
        });
        let tagsRead = 0;
        this.loadTagsTask.on("tags", (tags) => {
          tagsRead += tags.length;
          this.selectListView.update({ loadingBadge: import_humanize_plus.default.intComma(tagsRead) });
        });
      }
    }
  }
  stopTask() {
    if (this.loadTagsTask) {
      this.loadTagsTask.terminate();
    }
  }
  startTask() {
    this.stopTask();
    this.loadTagsTask = import_tag_reader.default.getAllTags((tags) => {
      this.tags = tags;
      this.reloadTags = this.tags.length === 0;
      this.selectListView.update({
        loadingMessage: null,
        loadingBadge: null,
        items: this.tags
      });
    });
    this.watchTagsFiles();
  }
  watchTagsFiles() {
    this.unwatchTagsFiles();
    this.tagsFileSubscriptions = new import_atom.CompositeDisposable();
    let reloadTags = () => {
      this.reloadTags = true;
      this.watchTagsFiles();
    };
    for (const projectPath of Array.from(atom.project.getPaths())) {
      const tagsFilePath = (0, import_get_tags_file.default)(projectPath);
      if (tagsFilePath) {
        const tagsFile = new import_atom.File(tagsFilePath);
        this.tagsFileSubscriptions.add(tagsFile.onDidChange(reloadTags));
        this.tagsFileSubscriptions.add(tagsFile.onDidDelete(reloadTags));
        this.tagsFileSubscriptions.add(tagsFile.onDidRename(reloadTags));
      }
    }
  }
  unwatchTagsFiles() {
    if (this.tagsFileSubscriptions) {
      this.tagsFileSubscriptions.dispose();
    }
    this.tagsFileSubscriptions = null;
  }
}
