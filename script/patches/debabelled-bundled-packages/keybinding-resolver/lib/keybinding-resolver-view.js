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
var keybinding_resolver_view_exports = {};
__export(keybinding_resolver_view_exports, {
  default: () => KeyBindingResolverView
});
module.exports = __toCommonJS(keybinding_resolver_view_exports);
var import_fs_plus = __toESM(require("fs-plus"));
var import_etch = __toESM(require("etch"));
var import_atom = require("atom");
var import_path = __toESM(require("path"));
class KeyBindingResolverView {
  constructor() {
    this.keystrokes = null;
    this.usedKeyBinding = null;
    this.unusedKeyBindings = [];
    this.unmatchedKeyBindings = [];
    this.partiallyMatchedBindings = [];
    this.attached = false;
    this.disposables = new import_atom.CompositeDisposable();
    this.keybindingDisposables = new import_atom.CompositeDisposable();
    this.disposables.add(atom.workspace.getBottomDock().observeActivePaneItem((item) => {
      if (item === this) {
        this.attach();
      } else {
        this.detach();
      }
    }));
    this.disposables.add(atom.workspace.getBottomDock().observeVisible((visible) => {
      if (visible) {
        if (atom.workspace.getBottomDock().getActivePaneItem() === this) this.attach();
      } else {
        this.detach();
      }
    }));
    import_etch.default.initialize(this);
  }
  getTitle() {
    return "Key Binding Resolver";
  }
  getIconName() {
    return "keyboard";
  }
  getDefaultLocation() {
    return "bottom";
  }
  getAllowedLocations() {
    return ["bottom"];
  }
  getURI() {
    return "atom://keybinding-resolver";
  }
  serialize() {
    return {
      deserializer: "keybinding-resolver/KeyBindingResolverView"
    };
  }
  destroy() {
    this.disposables.dispose();
    this.detach();
    return import_etch.default.destroy(this);
  }
  attach() {
    if (this.attached) return;
    this.attached = true;
    this.keybindingDisposables = new import_atom.CompositeDisposable();
    this.keybindingDisposables.add(atom.keymaps.onDidMatchBinding(({ keystrokes, binding, keyboardEventTarget, eventType }) => {
      if (eventType === "keyup" && binding == null) {
        return;
      }
      const unusedKeyBindings = atom.keymaps.findKeyBindings({ keystrokes, target: keyboardEventTarget }).filter((b) => b !== binding);
      const unmatchedKeyBindings = atom.keymaps.findKeyBindings({ keystrokes }).filter((b) => b !== binding && !unusedKeyBindings.includes(b));
      this.update({ usedKeyBinding: binding, unusedKeyBindings, unmatchedKeyBindings, keystrokes });
    }));
    this.keybindingDisposables.add(atom.keymaps.onDidPartiallyMatchBindings(({ keystrokes, partiallyMatchedBindings }) => {
      this.update({ keystrokes, partiallyMatchedBindings });
    }));
    this.keybindingDisposables.add(atom.keymaps.onDidFailToMatchBinding(({ keystrokes, keyboardEventTarget, eventType }) => {
      if (eventType === "keyup") {
        return;
      }
      const unusedKeyBindings = atom.keymaps.findKeyBindings({ keystrokes, target: keyboardEventTarget });
      const unmatchedKeyBindings = atom.keymaps.findKeyBindings({ keystrokes }).filter((b) => !unusedKeyBindings.includes(b));
      this.update({ unusedKeyBindings, unmatchedKeyBindings, keystrokes });
    }));
  }
  detach() {
    if (!this.attached) return;
    this.attached = false;
    this.keybindingDisposables.dispose();
    this.keybindingDisposables = null;
  }
  update(props) {
    this.keystrokes = props.keystrokes;
    this.usedKeyBinding = props.usedKeyBinding;
    this.unusedKeyBindings = props.unusedKeyBindings || [];
    this.unmatchedKeyBindings = props.unmatchedKeyBindings || [];
    this.partiallyMatchedBindings = props.partiallyMatchedBindings || [];
    return import_etch.default.update(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "key-binding-resolver" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-heading" }, this.renderKeystrokes()), /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-body" }, this.renderKeyBindings()));
  }
  renderKeystrokes() {
    if (this.keystrokes) {
      if (this.partiallyMatchedBindings.length > 0) {
        return /* @__PURE__ */ import_etch.default.dom("span", { className: "keystroke highlight-info" }, this.keystrokes, " (partial)");
      } else {
        return /* @__PURE__ */ import_etch.default.dom("span", { className: "keystroke highlight-info" }, this.keystrokes);
      }
    } else {
      return /* @__PURE__ */ import_etch.default.dom("span", null, "Press any key");
    }
  }
  renderKeyBindings() {
    if (this.partiallyMatchedBindings.length > 0) {
      return /* @__PURE__ */ import_etch.default.dom("table", { className: "table-condensed" }, /* @__PURE__ */ import_etch.default.dom("tbody", null, this.partiallyMatchedBindings.map((binding) => /* @__PURE__ */ import_etch.default.dom("tr", { className: "unused" }, /* @__PURE__ */ import_etch.default.dom("td", { className: "copy", onclick: () => this.copyKeybinding(binding) }, /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-clippy" })), /* @__PURE__ */ import_etch.default.dom("td", { className: "command" }, binding.command), /* @__PURE__ */ import_etch.default.dom("td", { className: "keystrokes" }, binding.keystrokes), /* @__PURE__ */ import_etch.default.dom("td", { className: "selector" }, binding.selector), /* @__PURE__ */ import_etch.default.dom("td", { className: "source", onclick: () => this.openKeybindingFile(binding.source) }, binding.source)))));
    } else {
      let usedKeyBinding = "";
      if (this.usedKeyBinding) {
        usedKeyBinding = /* @__PURE__ */ import_etch.default.dom("tr", { className: "used" }, /* @__PURE__ */ import_etch.default.dom("td", { className: "copy", onclick: () => this.copyKeybinding(this.usedKeyBinding) }, /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-clippy" })), /* @__PURE__ */ import_etch.default.dom("td", { className: "command" }, this.usedKeyBinding.command), /* @__PURE__ */ import_etch.default.dom("td", { className: "selector" }, this.usedKeyBinding.selector), /* @__PURE__ */ import_etch.default.dom("td", { className: "source", onclick: () => this.openKeybindingFile(this.usedKeyBinding.source) }, this.usedKeyBinding.source));
      }
      return /* @__PURE__ */ import_etch.default.dom("table", { className: "table-condensed" }, /* @__PURE__ */ import_etch.default.dom("tbody", null, usedKeyBinding, this.unusedKeyBindings.map((binding) => /* @__PURE__ */ import_etch.default.dom("tr", { className: "unused" }, /* @__PURE__ */ import_etch.default.dom("td", { className: "copy", onclick: () => this.copyKeybinding(binding) }, /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-clippy" })), /* @__PURE__ */ import_etch.default.dom("td", { className: "command" }, binding.command), /* @__PURE__ */ import_etch.default.dom("td", { className: "selector" }, binding.selector), /* @__PURE__ */ import_etch.default.dom("td", { className: "source", onclick: () => this.openKeybindingFile(binding.source) }, binding.source))), this.unmatchedKeyBindings.map((binding) => /* @__PURE__ */ import_etch.default.dom("tr", { className: "unmatched" }, /* @__PURE__ */ import_etch.default.dom("td", { className: "copy", onclick: () => this.copyKeybinding(binding) }, /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-clippy" })), /* @__PURE__ */ import_etch.default.dom("td", { className: "command" }, binding.command), /* @__PURE__ */ import_etch.default.dom("td", { className: "selector" }, binding.selector), /* @__PURE__ */ import_etch.default.dom("td", { className: "source", onclick: () => this.openKeybindingFile(binding.source) }, binding.source)))));
    }
  }
  isInAsarArchive(pathToCheck) {
    const { resourcePath } = atom.getLoadSettings();
    return pathToCheck.startsWith(`${resourcePath}${import_path.default.sep}`) && import_path.default.extname(resourcePath) === ".asar";
  }
  extractBundledKeymap(bundledKeymapPath) {
    const metadata = require(import_path.default.join(atom.getLoadSettings().resourcePath, "package.json"));
    const bundledKeymaps = metadata ? metadata._atomKeymaps : {};
    const keymapName = import_path.default.basename(bundledKeymapPath);
    const extractedKeymapPath = import_path.default.join(require("temp").mkdirSync("atom-bundled-keymap-"), keymapName);
    import_fs_plus.default.writeFileSync(
      extractedKeymapPath,
      JSON.stringify(bundledKeymaps[keymapName] || {}, null, 2)
    );
    return extractedKeymapPath;
  }
  extractBundledPackageKeymap(keymapRelativePath) {
    const packageName = keymapRelativePath.split(import_path.default.sep)[1];
    const keymapName = import_path.default.basename(keymapRelativePath);
    const metadata = atom.packages.packagesCache[packageName] || {};
    const keymaps = metadata.keymaps || {};
    const extractedKeymapPath = import_path.default.join(require("temp").mkdirSync("atom-bundled-keymap-"), keymapName);
    import_fs_plus.default.writeFileSync(
      extractedKeymapPath,
      JSON.stringify(keymaps[keymapRelativePath] || {}, null, 2)
    );
    return extractedKeymapPath;
  }
  openKeybindingFile(keymapPath) {
    if (this.isInAsarArchive(keymapPath)) {
      keymapPath = this.extractBundledKeymap(keymapPath);
    } else if (keymapPath.startsWith("core:node_modules")) {
      keymapPath = this.extractBundledPackageKeymap(keymapPath.replace("core:", ""));
    } else if (keymapPath.startsWith("core:")) {
      keymapPath = this.extractBundledKeymap(keymapPath.replace("core:", ""));
    }
    atom.workspace.open(keymapPath);
  }
  copyKeybinding(binding) {
    let content;
    const keymapExtension = import_path.default.extname(atom.keymaps.getUserKeymapPath());
    let escapedKeystrokes = binding.keystrokes.replace(/\\/g, "\\\\");
    if (keymapExtension === ".cson") {
      content = `'${binding.selector}':
  '${escapedKeystrokes}': '${binding.command}'
`;
    } else {
      content = `"${binding.selector}": {
  "${escapedKeystrokes}": "${binding.command}"
}
`;
    }
    atom.notifications.addInfo("Keybinding Copied");
    return atom.clipboard.write(content);
  }
}
