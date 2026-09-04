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
var import_atom = require("chevron");
var import_humanize_plus = __toESM(require("humanize-plus"));
var import_symbols_view = __toESM(require("./symbols-view"));
var import_tag_reader = __toESM(require("./tag-reader"));
var import_get_tags_file = __toESM(require("./get-tags-file"));
var import_lsp_symbols = require("./lsp-symbols");

// How long to wait after a keystroke before asking the servers. Long enough
// that typing a word is one query rather than five, short enough not to feel
// like lag.
const QUERY_DEBOUNCE_MS = 120;

// Ask for more than fits on screen, since the ranking that matters is the
// merge across servers, not the tail of one server's answer.
const QUERY_LIMIT = 100;

// The list is empty for two different reasons in LSP mode, and "no tags file"
// is wrong for both of them.
const NOTHING_TYPED_YET = "Type to search symbols across the project";
const NO_MATCHES = "No symbols in this project match";
const NO_TAGS_FILE = "Project has no tags file or it is empty";

class ProjectView extends import_symbols_view.default {
  constructor(stack) {
    super(stack, NO_TAGS_FILE, 10);
    this.reloadTags = true;
    this.usingLsp = false;
    this.queryToken = 0;
  }
  selectListProps() {
    return {
      // Servers do their own matching, and a second fuzzy pass here would
      // drop what they matched on a container or an abbreviation the local
      // matcher does not score. Only bypass the local filter while the
      // results came from a server; ctags still wants it.
      filter: (items, query) => {
        if (this.usingLsp) return items;
        // SelectListView filters once while it is still constructing, before
        // this view has a reference to it. The list is empty at that point,
        // so there is nothing to filter yet.
        if (!this.selectListView) return items;
        return this.selectListView.fuzzyFilter(items, query);
      },
      didChangeQuery: (query) => this.didChangeQuery(query)
    };
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
  // LSP first, ctags when no server can answer. The two are not merged: a
  // server that knows the project's symbols has better answers than a tags
  // file, and showing both would mean showing every symbol twice.
  async populate() {
    this.usingLsp = (0, import_lsp_symbols.lspServesProjectSymbols)(chevron.lsp);
    if (this.usingLsp) {
      return this.populateFromLsp();
    }
    return this.populateFromTags();
  }
  async populateFromLsp() {
    this.stopTask();
    const query = this.selectListView.getFilterQuery();
    if (!query) {
      // Most servers answer an empty workspace/symbol query with nothing, so
      // an empty list here would read as "this project has no symbols".
      await this.selectListView.update({
        items: [],
        loadingMessage: null,
        loadingBadge: null,
        // A tags file is read once and filtered locally, so ten rows was
        // plenty. A server ranks the whole project per keystroke, and
        // cutting that to ten throws away the part worth scrolling.
        maxResults: QUERY_LIMIT,
        // Nothing has been asked yet, so nothing is missing. Without this the
        // empty-list message shows under the prompt to type.
        emptyMessage: null,
        infoMessage: NOTHING_TYPED_YET
      });
      return;
    }
    return this.runQuery(query);
  }
  async runQuery(query) {
    const token = ++this.queryToken;
    await this.selectListView.update({
      infoMessage: null,
      emptyMessage: NO_MATCHES,
      loadingMessage: "Searching project symbols…"
    });
    let symbols = [];
    try {
      symbols = await chevron.lsp.projectSymbols(query, { limit: QUERY_LIMIT });
    } catch (error) {
      // A server that fails is not an error the user asked for. Say nothing
      // found rather than putting a stack trace in the palette.
      symbols = [];
    }
    // Typing kept going while this was in flight; that answer is stale.
    if (token !== this.queryToken) return;
    const items = (0, import_lsp_symbols.itemsForSymbols)(
      symbols,
      chevron.project.getPaths()
    );
    return this.selectListView.update({
      loadingMessage: null,
      loadingBadge: null,
      items
    });
  }
  didChangeQuery(query) {
    if (!this.usingLsp) return;
    if (this.queryTimer) clearTimeout(this.queryTimer);
    if (!query) {
      this.queryToken++;
      this.selectListView.update({
        items: [],
        loadingMessage: null,
        emptyMessage: null,
        infoMessage: NOTHING_TYPED_YET
      });
      return;
    }
    this.queryTimer = setTimeout(() => {
      this.queryTimer = null;
      this.runQuery(query);
    }, QUERY_DEBOUNCE_MS);
  }
  async populateFromTags() {
    // A window can lose its server -- untrusting the project stops them --
    // and the ctags list means something different when it is empty.
    await this.selectListView.update({
      infoMessage: null,
      emptyMessage: NO_TAGS_FILE
    });
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
    if (this.queryTimer) {
      clearTimeout(this.queryTimer);
      this.queryTimer = null;
    }
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
    for (const projectPath of Array.from(chevron.project.getPaths())) {
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

// Chevron: Node require() interop for default-only esbuild ESM modules
if (module.exports && module.exports.__esModule && module.exports.default != null) {
  var __keys = Object.keys(module.exports).filter(function (k) {
    return k !== '__esModule' && k !== 'default';
  });
  if (__keys.length === 0) {
    module.exports = module.exports.default;
  }
}
