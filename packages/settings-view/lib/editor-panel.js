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
var editor_panel_exports = {};
__export(editor_panel_exports, {
  default: () => EditorPanel
});
module.exports = __toCommonJS(editor_panel_exports);
var import_atom = require("chevron");
var import_etch = __toESM(require("etch"));
var import_settings_panel = __toESM(require("./settings-panel"));
class EditorPanel {
  constructor() {
    import_etch.default.initialize(this);
    this.subscriptions = new import_atom.CompositeDisposable();
    this.subscriptions.add(chevron.commands.add(this.element, {
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
  }
  destroy() {
    this.subscriptions.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { tabIndex: "0", className: "panels-item", onclick: this.didClick }, /* @__PURE__ */ import_etch.default.dom(
      import_settings_panel.default,
      {
        namespace: "editor",
        icon: "code",
        note: `<div class="text icon icon-question" id="editor-settings-note" tabindex="-1">These settings are related to text editing. Some of these can be overriden on a per-language basis. Check language settings by clicking its package card in the <a class="link packages-open">Packages list</a>.</div>`
      }
    ));
  }
  focus() {
    this.element.focus();
  }
  show() {
    this.element.style.display = "";
  }
  didClick(event) {
    const target = event.target.closest(".packages-open");
    if (target) {
      chevron.workspace.open("chevron://config/packages");
    }
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
}
