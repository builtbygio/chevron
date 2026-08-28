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
var system_windows_panel_exports = {};
__export(system_windows_panel_exports, {
  default: () => SystemPanel
});
module.exports = __toCommonJS(system_windows_panel_exports);
var import_atom = require("chevron");
var import_etch = __toESM(require("etch"));
class SystemPanel {
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
    import_atom.WinShell.fileHandler.isRegistered((i) => {
      this.refs.fileHandlerCheckbox.checked = i;
    });
    import_atom.WinShell.fileContextMenu.isRegistered((i) => {
      this.refs.fileContextMenuCheckbox.checked = i;
    });
    import_atom.WinShell.folderContextMenu.isRegistered((i) => {
      this.refs.folderContextMenuCheckbox.checked = i;
    });
  }
  destroy() {
    this.subscriptions.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "panels-item", tabIndex: "0" }, /* @__PURE__ */ import_etch.default.dom("form", { className: "general-panel section" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "settings-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-container" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "block section-heading icon icon-device-desktop" }, "System Settings"), /* @__PURE__ */ import_etch.default.dom("div", { className: "text icon icon-question" }, "These settings determine how Chevron integrates with your operating system."), /* @__PURE__ */ import_etch.default.dom("div", { className: "section-body" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "control-group" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "controls" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "checkbox" }, /* @__PURE__ */ import_etch.default.dom("label", { for: "system.windows.file-handler" }, /* @__PURE__ */ import_etch.default.dom(
      "input",
      {
        ref: "fileHandlerCheckbox",
        id: "system.windows.file-handler",
        className: "input-checkbox",
        type: "checkbox",
        onclick: (e) => {
          this.setRegistration(import_atom.WinShell.fileHandler, e.target.checked);
        }
      }
    ), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title" }, "Register as file handler"), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description" }, "Show ", import_atom.WinShell.appName, ' in the "Open with" application list for easy association with file types.'))))), /* @__PURE__ */ import_etch.default.dom("div", { className: "control-group" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "controls" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "checkbox" }, /* @__PURE__ */ import_etch.default.dom("label", { for: "system.windows.shell-menu-files" }, /* @__PURE__ */ import_etch.default.dom(
      "input",
      {
        ref: "fileContextMenuCheckbox",
        id: "system.windows.shell-menu-files",
        className: "input-checkbox",
        type: "checkbox",
        onclick: (e) => {
          this.setRegistration(import_atom.WinShell.fileContextMenu, e.target.checked);
        }
      }
    ), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title" }, "Show in file context menus"), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description" }, 'Add "Open with ', import_atom.WinShell.appName, '" to the File Explorer context menu for files.'))))), /* @__PURE__ */ import_etch.default.dom("div", { className: "control-group" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "controls" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "checkbox" }, /* @__PURE__ */ import_etch.default.dom("label", { for: "system.windows.shell-menu-folders" }, /* @__PURE__ */ import_etch.default.dom(
      "input",
      {
        ref: "folderContextMenuCheckbox",
        id: "system.windows.shell-menu-folders",
        className: "input-checkbox",
        type: "checkbox",
        onclick: (e) => {
          this.setRegistration(import_atom.WinShell.folderContextMenu, e.target.checked);
          this.setRegistration(import_atom.WinShell.folderBackgroundContextMenu, e.target.checked);
        }
      }
    ), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title" }, "Show in folder context menus"), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description" }, 'Add "Open with ', import_atom.WinShell.appName, '" to the File Explorer context menu for folders.'))))))))));
  }
  setRegistration(option, shouldBeRegistered) {
    if (shouldBeRegistered) {
      return option.register(function() {
      });
    } else {
      return option.deregister(function() {
      });
    }
  }
  focus() {
    this.element.focus();
  }
  show() {
    this.element.style.display = "";
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
