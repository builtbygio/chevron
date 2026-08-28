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
var keybindings_panel_exports = {};
__export(keybindings_panel_exports, {
  default: () => KeybindingsPanel
});
module.exports = __toCommonJS(keybindings_panel_exports);
var import_atom = require("chevron");
var import_etch = __toESM(require("etch"));
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_path = __toESM(require("path"));
class KeybindingsPanel {
  constructor() {
    import_etch.default.initialize(this);
    this.disposables = new import_atom.CompositeDisposable();
    this.disposables.add(chevron.commands.add(this.element, {
      "core:move-up": () => {
        this.scrollUp();
      },
      "core:move-down": () => {
        this.scrollDown();
      },
      "core:page-up": () => {
        this.pageUp();
      },
      "core:page-down": () => {
        this.pageDown();
      },
      "core:move-to-top": () => {
        this.scrollToTop();
      },
      "core:move-to-bottom": () => {
        this.scrollToBottom();
      }
    }));
    this.otherPlatformPattern = new RegExp(`\\.platform-(?!${import_underscore_plus.default.escapeRegExp(process.platform)}\\b)`);
    this.platformPattern = new RegExp(`\\.platform-${import_underscore_plus.default.escapeRegExp(process.platform)}\\b`);
    this.disposables.add(this.refs.searchEditor.onDidStopChanging(() => {
      this.filterKeyBindings(this.keyBindings, this.refs.searchEditor.getText());
    }));
    this.disposables.add(chevron.keymaps.onDidReloadKeymap(() => {
      this.loadKeyBindings();
    }));
    this.disposables.add(chevron.keymaps.onDidUnloadKeymap(() => {
      this.loadKeyBindings();
    }));
    this.loadKeyBindings();
  }
  destroy() {
    this.disposables.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "panels-item", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("section", { className: "keybinding-panel section" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-heading icon icon-keyboard" }, "Keybindings"), /* @__PURE__ */ import_etch.default.dom("div", { className: "text native-key-bindings", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-question" }), /* @__PURE__ */ import_etch.default.dom("span", null, "You can override these keybindings by copying "), /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-clippy" }), /* @__PURE__ */ import_etch.default.dom("span", null, "and pasting them into "), /* @__PURE__ */ import_etch.default.dom("a", { className: "link", onclick: this.didClickOpenKeymapFile }, "your keymap file")), /* @__PURE__ */ import_etch.default.dom("div", { className: "editor-container" }, /* @__PURE__ */ import_etch.default.dom(import_atom.TextEditor, { mini: true, ref: "searchEditor", placeholderText: "Search keybindings" })), /* @__PURE__ */ import_etch.default.dom("table", { className: "native-key-bindings table text", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("col", { className: "keystroke" }), /* @__PURE__ */ import_etch.default.dom("col", { className: "command" }), /* @__PURE__ */ import_etch.default.dom("col", { className: "source" }), /* @__PURE__ */ import_etch.default.dom("col", { className: "selector" }), /* @__PURE__ */ import_etch.default.dom("thead", null, /* @__PURE__ */ import_etch.default.dom("tr", null, /* @__PURE__ */ import_etch.default.dom("th", { className: "keystroke" }, "Keystroke"), /* @__PURE__ */ import_etch.default.dom("th", { className: "command" }, "Command"), /* @__PURE__ */ import_etch.default.dom("th", { className: "source" }, "Source"), /* @__PURE__ */ import_etch.default.dom("th", { className: "selector" }, "Selector"))), /* @__PURE__ */ import_etch.default.dom("tbody", { ref: "keybindingRows" }))));
  }
  loadKeyBindings() {
    this.refs.keybindingRows.innerHTML = "";
    this.keyBindings = import_underscore_plus.default.sortBy(chevron.keymaps.getKeyBindings(), "keystrokes");
    this.appendKeyBindings(this.keyBindings);
    this.filterKeyBindings(this.keyBindings, this.refs.searchEditor.getText());
  }
  focus() {
    this.refs.searchEditor.element.focus();
  }
  show() {
    this.element.style.display = "";
  }
  filterKeyBindings(keyBindings, filterString) {
    this.refs.keybindingRows.innerHTML = "";
    for (let keyBinding of keyBindings) {
      let { selector, keystrokes, command, source } = keyBinding;
      source = KeybindingsPanel.determineSource(source);
      var searchString = `${selector}${keystrokes}${command}${source}`.toLowerCase();
      if (!searchString) {
        continue;
      }
      const keywords = filterString.trim().toLowerCase().split(" ");
      if (keywords.every((keyword) => searchString.indexOf(keyword) !== -1)) {
        this.appendKeyBinding(keyBinding);
      }
    }
  }
  appendKeyBindings(keyBindings) {
    for (const keyBinding of keyBindings) {
      this.appendKeyBinding(keyBinding);
    }
  }
  appendKeyBinding(keyBinding) {
    if (!this.showSelector(keyBinding.selector)) {
      return;
    }
    const element = this.elementForKeyBinding(keyBinding);
    element.dataset.keyBinding = keyBinding;
    this.refs.keybindingRows.appendChild(element);
  }
  showSelector(selector) {
    let segments;
    if (selector) {
      segments = selector.split(",") || [];
    } else {
      segments = [];
    }
    return segments.some((s) => this.platformPattern.test(s) || !this.otherPlatformPattern.test(s));
  }
  elementForKeyBinding(keyBinding) {
    let { selector, keystrokes, command, source } = keyBinding;
    source = KeybindingsPanel.determineSource(source);
    const tr = document.createElement("tr");
    if (source === "User") {
      tr.classList.add("is-user");
    }
    const keystrokeTd = document.createElement("td");
    keystrokeTd.classList.add("keystroke");
    const copyIcon = document.createElement("span");
    copyIcon.classList.add("icon", "icon-clippy", "copy-icon");
    copyIcon.onclick = () => {
      let content;
      const keymapExtension = import_path.default.extname(chevron.keymaps.getUserKeymapPath());
      const escapeCSON = (input) => {
        return JSON.stringify(input).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
      };
      if (keymapExtension === ".json") {
        content = `'${escapeCSON(selector)}':
  '${escapeCSON(keystrokes)}': '${escapeCSON(command)}'`;
      } else {
        content = `${JSON.stringify(selector)}: {
  ${JSON.stringify(keystrokes)}: ${JSON.stringify(command)}
}`;
      }
      return chevron.clipboard.write(content);
    };
    keystrokeTd.appendChild(copyIcon);
    const keystrokesSpan = document.createElement("span");
    keystrokesSpan.textContent = keystrokes;
    keystrokeTd.appendChild(keystrokesSpan);
    tr.appendChild(keystrokeTd);
    const commandTd = document.createElement("td");
    commandTd.classList.add("command");
    commandTd.textContent = command;
    tr.appendChild(commandTd);
    const sourceTd = document.createElement("td");
    sourceTd.classList.add("source");
    sourceTd.textContent = source;
    tr.appendChild(sourceTd);
    const selectorTd = document.createElement("td");
    selectorTd.classList.add("selector");
    selectorTd.textContent = selector;
    tr.appendChild(selectorTd);
    return tr;
  }
  didClickOpenKeymapFile(e) {
    e.preventDefault();
    chevron.commands.dispatch(chevron.views.getView(chevron.workspace), "application:open-your-keymap");
  }
  scrollUp() {
    this.element.scrollTop -= document.body.offsetHeight / 20;
  }
  scrollDown() {
    this.element.scrollTop += document.body.offsetHeight / 20;
  }
  pageUp() {
    this.element.scrollTop -= this.element.offsetHeight;
  }
  pageDown() {
    this.element.scrollTop += this.element.offsetHeight;
  }
  scrollToTop() {
    this.element.scrollTop = 0;
  }
  scrollToBottom() {
    this.element.scrollTop = this.element.scrollHeight;
  }
  // Private: Returns a user friendly description of where a keybinding was
  // loaded from.
  //
  // * filePath:
  //   The absolute path from which the keymap was loaded
  //
  // Returns one of:
  // * `Core` indicates it comes from a bundled package.
  // * `User` indicates that it was defined by a user.
  // * `<package-name>` the package which defined it.
  // * `Unknown` if an invalid path was passed in.
  static determineSource(filePath) {
    if (!filePath) {
      return "Unknown";
    }
    if (filePath.indexOf(import_path.default.join(chevron.getLoadSettings().resourcePath, "keymaps")) === 0) {
      return "Core";
    } else if (filePath === chevron.keymaps.getUserKeymapPath()) {
      return "User";
    } else {
      const pathParts = filePath.split(import_path.default.sep);
      const packageNameIndex = pathParts.length - 3;
      const packageName = pathParts[packageNameIndex] != null ? pathParts[packageNameIndex] : "";
      return import_underscore_plus.default.undasherize(import_underscore_plus.default.uncamelcase(packageName));
    }
  }
}
