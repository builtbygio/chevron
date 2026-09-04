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
var symbols_view_exports = {};
__export(symbols_view_exports, {
  default: () => SymbolsView
});
module.exports = __toCommonJS(symbols_view_exports);
var import_path = __toESM(require("path"));
var import_atom = require("chevron");
var import_atom_select_list = __toESM(require("atom-select-list"));
var import_fs_plus = __toESM(require("fs-plus"));
var import_fuzzaldrin = require("fuzzaldrin");
class SymbolsView {
  static highlightMatches(context, name, matches, offsetIndex) {
    if (!offsetIndex) {
      offsetIndex = 0;
    }
    let lastIndex = 0;
    let matchedChars = [];
    const fragment = document.createDocumentFragment();
    for (let matchIndex of Array.from(matches)) {
      matchIndex -= offsetIndex;
      if (matchIndex < 0) {
        continue;
      }
      const unmatched = name.substring(lastIndex, matchIndex);
      if (unmatched) {
        if (matchedChars.length) {
          const span = document.createElement("span");
          span.classList.add("character-match");
          span.textContent = matchedChars.join("");
          fragment.appendChild(span);
        }
        matchedChars = [];
        fragment.appendChild(document.createTextNode(unmatched));
      }
      matchedChars.push(name[matchIndex]);
      lastIndex = matchIndex + 1;
    }
    if (matchedChars.length) {
      const span = document.createElement("span");
      span.classList.add("character-match");
      span.textContent = matchedChars.join("");
      fragment.appendChild(span);
    }
    fragment.appendChild(document.createTextNode(name.substring(lastIndex)));
    return fragment;
  }
  // Props a subclass wants SelectListView to be constructed with, for the
  // ones its `update()` will not take later -- `didChangeQuery` above all,
  // which is what a view needs when results come from a server rather than
  // from a list already in memory.
  //
  // A method rather than a constructor argument because a subclass cannot
  // touch `this` while it is still evaluating its own `super(...)` call, and
  // these props are closures over the view.
  selectListProps() {
    return {};
  }
  constructor(stack, emptyMessage = "No symbols found", maxResults = null) {
    this.stack = stack;
    this.selectListView = new import_atom_select_list.default(Object.assign({
      maxResults,
      emptyMessage,
      items: [],
      filterKeyForItem: (item) => item.name,
      elementForItem: this.elementForItem.bind(this),
      didChangeSelection: this.didChangeSelection.bind(this),
      didConfirmSelection: this.didConfirmSelection.bind(this),
      didConfirmEmptySelection: this.didConfirmEmptySelection.bind(this),
      didCancelSelection: this.didCancelSelection.bind(this)
    }, this.selectListProps()));
    this.element = this.selectListView.element;
    this.element.classList.add("symbols-view");
    this.panel = chevron.workspace.addModalPanel({ item: this, visible: false });
  }
  async destroy() {
    await this.cancel();
    this.panel.destroy();
    return this.selectListView.destroy();
  }
  getFilterKey() {
    return "name";
  }
  elementForItem({ position, name, file, directory }) {
    const matches = (0, import_fuzzaldrin.match)(name, this.selectListView.getFilterQuery());
    if (chevron.project.getPaths().length > 1) {
      file = import_path.default.join(import_path.default.basename(directory), file);
    }
    const li = document.createElement("li");
    li.classList.add("two-lines");
    const primaryLine = document.createElement("div");
    primaryLine.classList.add("primary-line");
    if (position) {
      primaryLine.textContent = `${name}:${position.row + 1}`;
    } else {
      primaryLine.appendChild(SymbolsView.highlightMatches(this, name, matches));
    }
    li.appendChild(primaryLine);
    const secondaryLine = document.createElement("div");
    secondaryLine.classList.add("secondary-line");
    secondaryLine.textContent = file;
    li.appendChild(secondaryLine);
    return li;
  }
  async cancel() {
    if (!this.isCanceling) {
      this.isCanceling = true;
      await this.selectListView.update({ items: [] });
      this.panel.hide();
      if (this.previouslyFocusedElement) {
        this.previouslyFocusedElement.focus();
        this.previouslyFocusedElement = null;
      }
      this.isCanceling = false;
    }
  }
  didCancelSelection() {
    this.cancel();
  }
  didConfirmEmptySelection() {
    this.cancel();
  }
  async didConfirmSelection(tag) {
    if (tag.file && !import_fs_plus.default.isFileSync(import_path.default.join(tag.directory, tag.file))) {
      await this.selectListView.update({ errorMessage: "Selected file does not exist" });
      setTimeout(() => {
        this.selectListView.update({ errorMessage: null });
      }, 2e3);
    } else {
      await this.cancel();
      this.openTag(tag);
    }
  }
  didChangeSelection(tag) {
  }
  openTag(tag) {
    const editor = chevron.workspace.getActiveTextEditor();
    let previous;
    if (editor) {
      previous = {
        editorId: editor.id,
        position: editor.getCursorBufferPosition(),
        file: editor.getURI()
      };
    }
    let { position } = tag;
    if (!position) {
      position = this.getTagLine(tag);
    }
    if (tag.file) {
      chevron.workspace.open(import_path.default.join(tag.directory, tag.file)).then(() => {
        if (position) {
          return this.moveToPosition(position);
        }
        return void 0;
      });
    } else if (position && previous && !previous.position.isEqual(position)) {
      this.moveToPosition(position);
    }
    this.stack.push(previous);
  }
  moveToPosition(position, beginningOfLine) {
    const editor = chevron.workspace.getActiveTextEditor();
    if (beginningOfLine == null) {
      beginningOfLine = true;
    }
    if (editor) {
      editor.setCursorBufferPosition(position, { autoscroll: false });
      if (beginningOfLine) {
        editor.moveToFirstCharacterOfLine();
      }
      editor.scrollToCursorPosition({ center: true });
    }
  }
  attach() {
    this.previouslyFocusedElement = document.activeElement;
    this.panel.show();
    this.selectListView.reset();
    this.selectListView.focus();
  }
  getTagLine(tag) {
    if (!tag) {
      return void 0;
    }
    if (tag.lineNumber) {
      return new import_atom.Point(tag.lineNumber - 1, 0);
    }
    if (!tag.pattern) {
      return void 0;
    }
    const pattern = tag.pattern.replace(/(^\/\^)|(\$\/$)/g, "").trim();
    if (!pattern) {
      return void 0;
    }
    const file = import_path.default.join(tag.directory, tag.file);
    if (!import_fs_plus.default.isFileSync(file)) {
      return void 0;
    }
    const iterable = import_fs_plus.default.readFileSync(file, "utf8").split("\n");
    for (let index = 0; index < iterable.length; index++) {
      let line = iterable[index];
      if (pattern === line.trim()) {
        return new import_atom.Point(index, 0);
      }
    }
    return void 0;
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
