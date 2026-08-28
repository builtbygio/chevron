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
var import_atom = require("chevron");
var import_symbols_view = __toESM(require("./symbols-view"));
var import_tag_generator = __toESM(require("./tag-generator"));
var import_fuzzaldrin = require("fuzzaldrin");
class FileView extends import_symbols_view.default {
  constructor(stack) {
    super(stack);
    this.cachedTags = {};
    this.watchedEditors = /* @__PURE__ */ new WeakSet();
    this.editorsSubscription = chevron.workspace.observeTextEditors((editor) => {
      if (this.watchedEditors.has(editor)) return;
      const removeFromCache = () => {
        delete this.cachedTags[editor.getPath()];
      };
      const editorSubscriptions = new import_atom.CompositeDisposable();
      editorSubscriptions.add(editor.onDidChangeGrammar(removeFromCache));
      editorSubscriptions.add(editor.onDidSave(removeFromCache));
      editorSubscriptions.add(editor.onDidChangePath(removeFromCache));
      editorSubscriptions.add(editor.getBuffer().onDidReload(removeFromCache));
      editorSubscriptions.add(editor.getBuffer().onDidDestroy(removeFromCache));
      editor.onDidDestroy(() => {
        this.watchedEditors.delete(editor);
        editorSubscriptions.dispose();
      });
      this.watchedEditors.add(editor);
    });
  }
  destroy() {
    this.editorsSubscription.dispose();
    return super.destroy();
  }
  elementForItem({ position, name }) {
    const matches = (0, import_fuzzaldrin.match)(name, this.selectListView.getFilterQuery());
    const li = document.createElement("li");
    li.classList.add("two-lines");
    const primaryLine = document.createElement("div");
    primaryLine.classList.add("primary-line");
    primaryLine.appendChild(import_symbols_view.default.highlightMatches(this, name, matches));
    li.appendChild(primaryLine);
    const secondaryLine = document.createElement("div");
    secondaryLine.classList.add("secondary-line");
    secondaryLine.textContent = `Line ${position.row + 1}`;
    li.appendChild(secondaryLine);
    return li;
  }
  didChangeSelection(item) {
    if (chevron.config.get("symbols-view.quickJumpToFileSymbol") && item) {
      this.openTag(item);
    }
  }
  async didCancelSelection() {
    await this.cancel();
    const editor = this.getEditor();
    if (this.initialState && editor) {
      this.deserializeEditorState(editor, this.initialState);
    }
    this.initialState = null;
  }
  async toggle() {
    if (this.panel.isVisible()) {
      await this.cancel();
    }
    const filePath = this.getPath();
    if (filePath) {
      const editor = this.getEditor();
      if (chevron.config.get("symbols-view.quickJumpToFileSymbol") && editor) {
        this.initialState = this.serializeEditorState(editor);
      }
      this.populate(filePath);
      this.attach();
    }
  }
  serializeEditorState(editor) {
    const editorElement = chevron.views.getView(editor);
    const scrollTop = editorElement.getScrollTop();
    return {
      bufferRanges: editor.getSelectedBufferRanges(),
      scrollTop
    };
  }
  deserializeEditorState(editor, { bufferRanges, scrollTop }) {
    const editorElement = chevron.views.getView(editor);
    editor.setSelectedBufferRanges(bufferRanges);
    editorElement.setScrollTop(scrollTop);
  }
  getEditor() {
    return chevron.workspace.getActiveTextEditor();
  }
  getPath() {
    if (this.getEditor()) {
      return this.getEditor().getPath();
    }
    return void 0;
  }
  getScopeName() {
    if (this.getEditor() && this.getEditor().getGrammar()) {
      return this.getEditor().getGrammar().scopeName;
    }
    return void 0;
  }
  async populate(filePath) {
    const tags = this.cachedTags[filePath];
    if (tags) {
      await this.selectListView.update({ items: tags });
    } else {
      await this.selectListView.update({
        items: [],
        loadingMessage: "Generating symbols…"
      });
      await this.selectListView.update({
        items: await this.generateTags(filePath),
        loadingMessage: null
      });
    }
  }
  async generateTags(filePath) {
    const generator = new import_tag_generator.default(filePath, this.getScopeName());
    this.cachedTags[filePath] = await generator.generate();
    return this.cachedTags[filePath];
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
