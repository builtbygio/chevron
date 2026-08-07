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
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var import_atom = require("atom");
var import_git_diff_view = __toESM(require("./git-diff-view"));
var import_diff_list_view = __toESM(require("./diff-list-view"));
let diffListView = null;
let diffViews = /* @__PURE__ */ new Set();
let subscriptions = null;
var main_default = {
  activate(state) {
    subscriptions = new import_atom.CompositeDisposable();
    subscriptions.add(
      atom.workspace.observeTextEditors((editor) => {
        const editorElement = atom.views.getView(editor);
        const diffView = new import_git_diff_view.default(editor, editorElement);
        diffViews.add(diffView);
        const listViewCommand = "git-diff:toggle-diff-list";
        const editorSubs = new import_atom.CompositeDisposable(
          atom.commands.add(editorElement, listViewCommand, () => {
            if (diffListView == null) diffListView = new import_diff_list_view.default();
            diffListView.toggle();
          }),
          editor.onDidDestroy(() => {
            diffView.destroy();
            diffViews.delete(diffView);
            editorSubs.dispose();
            subscriptions.remove(editorSubs);
          })
        );
        subscriptions.add(editorSubs);
      })
    );
  },
  deactivate() {
    diffListView = null;
    for (const diffView of diffViews) diffView.destroy();
    diffViews.clear();
    subscriptions.dispose();
    subscriptions = null;
  }
};
