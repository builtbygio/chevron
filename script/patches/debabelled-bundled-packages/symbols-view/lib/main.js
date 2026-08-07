var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var main_exports = {};
__export(main_exports, {
  default: () => main_default
});
module.exports = __toCommonJS(main_exports);
var main_default = {
  activate() {
    this.stack = [];
    this.workspaceSubscription = atom.commands.add("atom-workspace", {
      "symbols-view:toggle-project-symbols": () => {
        this.createProjectView().toggle();
      }
    });
    this.editorSubscription = atom.commands.add("atom-text-editor", {
      "symbols-view:toggle-file-symbols": () => {
        this.createFileView().toggle();
      },
      "symbols-view:go-to-declaration": () => {
        this.createGoToView().toggle();
      },
      "symbols-view:return-from-declaration": () => {
        this.createGoBackView().toggle();
      }
    });
  },
  deactivate() {
    if (this.fileView != null) {
      this.fileView.destroy();
      this.fileView = null;
    }
    if (this.projectView != null) {
      this.projectView.destroy();
      this.projectView = null;
    }
    if (this.goToView != null) {
      this.goToView.destroy();
      this.goToView = null;
    }
    if (this.goBackView != null) {
      this.goBackView.destroy();
      this.goBackView = null;
    }
    if (this.workspaceSubscription != null) {
      this.workspaceSubscription.dispose();
      this.workspaceSubscription = null;
    }
    if (this.editorSubscription != null) {
      this.editorSubscription.dispose();
      this.editorSubscription = null;
    }
  },
  createFileView() {
    if (this.fileView) {
      return this.fileView;
    }
    const FileView = require("./file-view");
    this.fileView = new FileView(this.stack);
    return this.fileView;
  },
  createProjectView() {
    if (this.projectView) {
      return this.projectView;
    }
    const ProjectView = require("./project-view");
    this.projectView = new ProjectView(this.stack);
    return this.projectView;
  },
  createGoToView() {
    if (this.goToView) {
      return this.goToView;
    }
    const GoToView = require("./go-to-view");
    this.goToView = new GoToView(this.stack);
    return this.goToView;
  },
  createGoBackView() {
    if (this.goBackView) {
      return this.goBackView;
    }
    const GoBackView = require("./go-back-view");
    this.goBackView = new GoBackView(this.stack);
    return this.goBackView;
  }
};
