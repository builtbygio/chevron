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
var window_panel_view_exports = {};
__export(window_panel_view_exports, {
  default: () => WindowPanelView
});
module.exports = __toCommonJS(window_panel_view_exports);
var import_atom = require("atom");
var import_etch = __toESM(require("etch"));
class WindowPanelView {
  constructor() {
    import_etch.default.initialize(this);
    this.disposables = new import_atom.CompositeDisposable();
    this.disposables.add(atom.tooltips.add(this.refs.shellTiming, { title: "The time taken to launch the app" }));
    this.disposables.add(atom.tooltips.add(this.refs.windowTiming, { title: "The time taken to load this window" }));
    this.disposables.add(atom.tooltips.add(this.refs.projectTiming, { title: "The time taken to rebuild the previously opened buffers" }));
    this.disposables.add(atom.tooltips.add(this.refs.workspaceTiming, { title: "The time taken to rebuild the previously opened editors" }));
  }
  update() {
  }
  destroy() {
    this.disposables.dispose();
    return import_etch.default.destroy(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "tool-panel padded package-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "inset-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-heading" }, "Startup Time"), /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-body padded" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "timing", ref: "shellTiming" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "Shell load time"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "shellLoadTime" }, "Loading…")), /* @__PURE__ */ import_etch.default.dom("div", { className: "timing", ref: "windowTiming" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "Window load time"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "windowLoadTime" }, "Loading…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "deserializeTimings" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "timing", ref: "projectTiming" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "Project load time"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "projectLoadTime" }, "Loading…")), /* @__PURE__ */ import_etch.default.dom("div", { className: "timing", ref: "workspaceTiming" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "Workspace load time"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "workspaceLoadTime" }, "Loading…"))))));
  }
  populate() {
    const time = atom.getWindowLoadTime();
    this.refs.windowLoadTime.classList.add(this.getHighlightClass(time));
    this.refs.windowLoadTime.textContent = `${time}ms`;
    const { shellLoadTime } = atom.getLoadSettings();
    if (shellLoadTime != null) {
      this.refs.shellLoadTime.classList.add(this.getHighlightClass(shellLoadTime));
      this.refs.shellLoadTime.textContent = `${shellLoadTime}ms`;
    } else {
      this.refs.shellTiming.style.display = "none";
    }
    if (atom.deserializeTimings.project != null) {
      this.refs.projectLoadTime.classList.add(this.getHighlightClass(atom.deserializeTimings.project));
      this.refs.projectLoadTime.textContent = `${atom.deserializeTimings.project}ms`;
      this.refs.workspaceLoadTime.classList.add(this.getHighlightClass(atom.deserializeTimings.workspace));
      this.refs.workspaceLoadTime.textContent = `${atom.deserializeTimings.workspace}ms`;
    } else {
      this.refs.deserializeTimings.style.display = "none";
    }
  }
  getHighlightClass(time) {
    if (time > 1e3) {
      return "highlight-error";
    } else if (time > 800) {
      return "highlight-warning";
    } else {
      return "highlight-info";
    }
  }
}
