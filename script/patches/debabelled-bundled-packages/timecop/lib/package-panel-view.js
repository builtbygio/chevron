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
var package_panel_view_exports = {};
__export(package_panel_view_exports, {
  default: () => PackagePanelView
});
module.exports = __toCommonJS(package_panel_view_exports);
var import_atom = require("atom");
var import_etch = __toESM(require("etch"));
class PackagePanelView {
  constructor({ title }) {
    this.title = title;
    import_etch.default.initialize(this);
    const clickHandler = (event) => {
      const target = event.target.closest("a.package");
      if (target) {
        atom.workspace.open(`atom://config/packages/${target.dataset.package}`);
      }
    };
    this.element.addEventListener("click", clickHandler);
    this.disposable = new import_atom.Disposable(() => {
      this.element.removeEventListener("click", clickHandler);
    });
  }
  update() {
  }
  destroy() {
    this.disposable.dispose();
    return import_etch.default.destroy(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "tool-panel padded package-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "inset-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-heading" }, this.title), /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-body padded" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "text-info", ref: "summary" }, "Loading…"), /* @__PURE__ */ import_etch.default.dom("ul", { className: "list-group", ref: "list" }))));
  }
  addPackages(packages, timeKey) {
    for (const pack of packages) {
      this.addPackage(pack, timeKey);
    }
  }
  addPackage(pack, timeKey) {
    const li = document.createElement("div");
    li.classList.add("list-item");
    const a = document.createElement("a");
    a.classList.add("inline-block", "package");
    a.dataset.package = pack.name;
    a.textContent = pack.name;
    li.appendChild(a);
    const line = document.createElement("span");
    line.classList.add("timecop-line");
    li.appendChild(line);
    const timeSpan = document.createElement("span");
    timeSpan.classList.add("inline-block", pack[timeKey] > 25 ? "highlight-error" : "highlight-warning");
    timeSpan.textContent = `${pack[timeKey]}ms`;
    li.appendChild(timeSpan);
    this.refs.list.appendChild(li);
  }
}
