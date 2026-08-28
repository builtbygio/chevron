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
var package_keymap_view_exports = {};
__export(package_keymap_view_exports, {
  default: () => PackageKeymapView
});
module.exports = __toCommonJS(package_keymap_view_exports);
var import_path = __toESM(require("path"));
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_atom = require("chevron");
var import_etch = __toESM(require("etch"));
var import_keybindings_panel = __toESM(require("./keybindings-panel"));
class PackageKeymapView {
  constructor(pack) {
    this.pack = pack;
    this.otherPlatformPattern = new RegExp(`\\.platform-(?!${import_underscore_plus.default.escapeRegExp(process.platform)}\\b)`);
    this.namespace = this.pack.name;
    this.disposables = new import_atom.CompositeDisposable();
    import_etch.default.initialize(this);
    const packagesWithKeymapsDisabled = chevron.config.get("core.packagesWithKeymapsDisabled") || [];
    this.refs.keybindingToggle.checked = !packagesWithKeymapsDisabled.includes(this.namespace);
    const changeHandler = (event) => {
      event.stopPropagation();
      const value = this.refs.keybindingToggle.checked;
      if (value) {
        chevron.config.removeAtKeyPath("core.packagesWithKeymapsDisabled", this.namespace);
      } else {
        chevron.config.pushAtKeyPath("core.packagesWithKeymapsDisabled", this.namespace);
      }
      this.updateKeyBindingView();
    };
    this.refs.keybindingToggle.addEventListener("change", changeHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.refs.keybindingToggle.removeEventListener("change", changeHandler);
    }));
    const copyIconClickHandler = (event) => {
      const target = event.target.closest(".copy-icon");
      if (target) {
        event.preventDefault();
        event.stopPropagation();
        this.writeKeyBindingToClipboard(target.closest("tr").dataset);
      }
    };
    this.element.addEventListener("click", copyIconClickHandler);
    this.disposables.add(new import_atom.Disposable(() => {
      this.element.removeEventListener("click", copyIconClickHandler);
    }));
    this.updateKeyBindingView();
    let hasKeymaps = false;
    for (let [packageKeymapsPath, keymap] of chevron.packages.getLoadedPackage(this.namespace).keymaps) {
      if (keymap.length > 0) {
        hasKeymaps = true;
        break;
      }
    }
    if (this.refs.keybindingItems.children.length === 0 && !hasKeymaps) {
      this.element.style.display = "none";
    }
  }
  update() {
  }
  destroy() {
    this.disposables.dispose();
    return import_etch.default.destroy(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("section", { className: "section" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-heading icon icon-keyboard" }, "Keybindings"), /* @__PURE__ */ import_etch.default.dom("div", { className: "checkbox" }, /* @__PURE__ */ import_etch.default.dom("label", { for: "toggleKeybindings" }, /* @__PURE__ */ import_etch.default.dom("input", { id: "toggleKeybindings", className: "input-checkbox", type: "checkbox", ref: "keybindingToggle" }), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title" }, "Enable")), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description" }, "Disable this if you want to bind your own keystrokes for this package's commands in your keymap.")), /* @__PURE__ */ import_etch.default.dom("table", { className: "package-keymap-table table native-key-bindings text", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("thead", null, /* @__PURE__ */ import_etch.default.dom("tr", null, /* @__PURE__ */ import_etch.default.dom("th", null, "Keystroke"), /* @__PURE__ */ import_etch.default.dom("th", null, "Command"), /* @__PURE__ */ import_etch.default.dom("th", null, "Selector"), /* @__PURE__ */ import_etch.default.dom("th", null, "Source"))), /* @__PURE__ */ import_etch.default.dom("tbody", { ref: "keybindingItems" })));
  }
  updateKeyBindingView() {
    this.refs.keybindingItems.innerHTML = "";
    const packagesWithKeymapsDisabled = chevron.config.get("core.packagesWithKeymapsDisabled") || [];
    const keybindingsDisabled = packagesWithKeymapsDisabled.includes(this.namespace);
    if (keybindingsDisabled) {
      this.refs.keybindingItems.classList.add("text-subtle");
    } else {
      this.refs.keybindingItems.classList.remove("text-subtle");
    }
    const keyBindings = [];
    if (chevron.keymaps.build) {
      for (const [keymapPath, keymap] of chevron.packages.getLoadedPackage(this.namespace).keymaps) {
        keyBindings.push(...atom.keymaps.build(this.namespace, keymap, 0, false));
      }
    } else {
      for (const keyBinding of chevron.keymaps.getKeyBindings()) {
        const { command } = keyBinding;
        if (command && command.indexOf && command.indexOf(`${this.namespace}:`) === 0) {
          keyBindings.push(keyBinding);
        }
      }
    }
    for (const keyBinding of keyBindings) {
      const { command, keystrokes, selector, source } = keyBinding;
      if (!command) {
        continue;
      }
      if (this.otherPlatformPattern.test(selector)) {
        continue;
      }
      const keyBindingRow = document.createElement("tr");
      keyBindingRow.dataset.selector = selector;
      keyBindingRow.dataset.keystrokes = keystrokes;
      keyBindingRow.dataset.command = command;
      const keystrokesTd = document.createElement("td");
      const copyIconSpan = document.createElement("span");
      copyIconSpan.classList.add("icon", "icon-clippy", "copy-icon");
      keystrokesTd.appendChild(copyIconSpan);
      const keystrokesSpan = document.createElement("span");
      keystrokesSpan.textContent = keystrokes;
      keystrokesTd.appendChild(keystrokesSpan);
      keyBindingRow.appendChild(keystrokesTd);
      const commandTd = document.createElement("td");
      commandTd.textContent = command;
      keyBindingRow.appendChild(commandTd);
      const selectorTd = document.createElement("td");
      selectorTd.textContent = selector;
      keyBindingRow.appendChild(selectorTd);
      const sourceTd = document.createElement("td");
      sourceTd.textContent = import_keybindings_panel.default.determineSource(source);
      keyBindingRow.appendChild(sourceTd);
      this.refs.keybindingItems.appendChild(keyBindingRow);
    }
  }
  writeKeyBindingToClipboard({ selector, keystrokes, command }) {
    let content;
    const keymapExtension = import_path.default.extname(chevron.keymaps.getUserKeymapPath());
    if (keymapExtension === ".json") {
      content = `'${selector}':
  '${keystrokes}': '${command}'`;
    } else {
      content = `"${selector}": {
  "${keystrokes}": "${command}"
}`;
    }
    chevron.clipboard.write(content);
  }
}
