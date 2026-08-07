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
var cache_panel_view_exports = {};
__export(cache_panel_view_exports, {
  default: () => CachePanelView
});
module.exports = __toCommonJS(cache_panel_view_exports);
var import_path = __toESM(require("path"));
var import_etch = __toESM(require("etch"));
class CachePanelView {
  constructor() {
    import_etch.default.initialize(this);
  }
  update() {
  }
  destroy() {
    return import_etch.default.destroy(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "tool-panel padded package-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "inset-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-heading" }, "Compile Cache"), /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-body padded" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "timing" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "CoffeeScript files compiled"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "coffeeCompileCount" }, "Loading…")), /* @__PURE__ */ import_etch.default.dom("div", { className: "timing" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "Babel files compiled"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "babelCompileCount" }, "Loading…")), /* @__PURE__ */ import_etch.default.dom("div", { className: "timing" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "Typescript files compiled"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "typescriptCompileCount" }, "Loading…")), /* @__PURE__ */ import_etch.default.dom("div", { className: "timing" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "CSON files compiled"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "csonCompileCount" }, "Loading…")), /* @__PURE__ */ import_etch.default.dom("div", { className: "timing" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block" }, "Less files compiled"), /* @__PURE__ */ import_etch.default.dom("span", { className: "inline-block", ref: "lessCompileCount" }, "Loading…")))));
  }
  populate() {
    const compileCacheStats = this.getCompileCacheStats();
    if (compileCacheStats) {
      this.refs.coffeeCompileCount.classList.add("highlight-info");
      this.refs.coffeeCompileCount.textContent = compileCacheStats[".coffee"].misses;
      this.refs.babelCompileCount.classList.add("highlight-info");
      this.refs.babelCompileCount.textContent = compileCacheStats[".js"].misses;
      this.refs.typescriptCompileCount.classList.add("highlight-info");
      this.refs.typescriptCompileCount.textContent = compileCacheStats[".ts"].misses;
    }
    this.refs.csonCompileCount.classList.add("highlight-info");
    this.refs.csonCompileCount.textContent = this.getCsonCompiles();
    this.refs.lessCompileCount.classList.add("highlight-info");
    this.refs.lessCompileCount.textContent = this.getLessCompiles();
  }
  getCompileCacheStats() {
    try {
      return require(import_path.default.join(atom.getLoadSettings().resourcePath, "src", "compile-cache")).getCacheStats();
    } catch (error) {
      return null;
    }
  }
  getCsonCompiles() {
    try {
      const CSON = require(import_path.default.join(atom.getLoadSettings().resourcePath, "node_modules", "season"));
      if (CSON.getCacheMisses) {
        return CSON.getCacheMisses() || 0;
      } else {
        return 0;
      }
    } catch (error) {
      return 0;
    }
  }
  getLessCompiles() {
    const lessCache = atom.themes.lessCache;
    if (lessCache && lessCache.cache && lessCache.cache.stats && lessCache.cache.stats.misses) {
      return lessCache.cache.stats.misses || 0;
    } else {
      return 0;
    }
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
