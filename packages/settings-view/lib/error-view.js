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
var error_view_exports = {};
__export(error_view_exports, {
  default: () => ErrorView
});
module.exports = __toCommonJS(error_view_exports);
var import_etch = __toESM(require("etch"));
class ErrorView {
  constructor(packageManager, { message, stderr, packageInstallError }) {
    import_etch.default.initialize(this);
    this.isOutputHidden = true;
    this.refs.detailsArea.style.display = "none";
    this.refs.details.textContent = stderr;
    this.refs.message.textContent = message;
    if (packageInstallError && process.platform === "win32") {
      packageManager.checkNativeBuildTools().catch(() => {
        this.refs.alert.appendChild(new CompileToolsErrorView().element);
      });
    }
  }
  update() {
  }
  destroy() {
    return import_etch.default.destroy(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "error-message" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "alert", className: "alert alert-danger alert-dismissable native-key-bindings", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("button", { ref: "close", className: "close icon icon-x", onclick: () => this.destroy() }), /* @__PURE__ */ import_etch.default.dom("span", { ref: "message", className: "native-key-bindings" }), /* @__PURE__ */ import_etch.default.dom("a", { ref: "detailsLink", className: "alert-link error-link", onclick: () => this.toggleOutput() }, "Show output…"), /* @__PURE__ */ import_etch.default.dom("div", { ref: "detailsArea", className: "padded" }, /* @__PURE__ */ import_etch.default.dom("pre", { ref: "details", className: "error-details text" }))));
  }
  toggleOutput() {
    if (this.isOutputHidden) {
      this.isOutputHidden = false;
      this.refs.detailsArea.style.display = "";
      this.refs.detailsLink.textContent = "Hide output…";
    } else {
      this.isOutputHidden = true;
      this.refs.detailsArea.style.display = "none";
      this.refs.detailsLink.textContent = "Show output…";
    }
  }
}
class CompileToolsErrorView {
  constructor() {
    import_etch.default.initialize(this);
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", null, /* @__PURE__ */ import_etch.default.dom("div", { className: "icon icon-alert compile-tools-heading compile-tools-message" }, "Compiler tools not found"), /* @__PURE__ */ import_etch.default.dom("div", { className: "compile-tools-message" }, "Packages that depend on modules that contain C/C++ code will fail to install."), /* @__PURE__ */ import_etch.default.dom("div", { className: "compile-tools-message" }, /* @__PURE__ */ import_etch.default.dom("span", null, "Read "), /* @__PURE__ */ import_etch.default.dom("a", { className: "link", href: "https://github.com/atom/atom/blob/master/docs/build-instructions/windows.md" }, "here"), /* @__PURE__ */ import_etch.default.dom("span", null, " for instructions on installing Python and Visual Studio.")), /* @__PURE__ */ import_etch.default.dom("div", { className: "compile-tools-message" }, /* @__PURE__ */ import_etch.default.dom("span", null, "Run "), /* @__PURE__ */ import_etch.default.dom("code", { className: "alert-danger" }, "apm install --check"), /* @__PURE__ */ import_etch.default.dom("span", null, " after installing to test compiling a native module.")));
  }
}
