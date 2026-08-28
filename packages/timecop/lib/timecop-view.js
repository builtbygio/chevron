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
var timecop_view_exports = {};
__export(timecop_view_exports, {
  default: () => TimecopView
});
module.exports = __toCommonJS(timecop_view_exports);
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_dedent = __toESM(require("dedent"));
var import_etch = __toESM(require("etch"));
var import_cache_panel_view = __toESM(require("./cache-panel-view"));
var import_package_panel_view = __toESM(require("./package-panel-view"));
var import_window_panel_view = __toESM(require("./window-panel-view"));
class TimecopView {
  constructor({ uri }) {
    this.uri = uri;
    import_etch.default.initialize(this);
    this.refs.cacheLoadingPanel.populate();
    if (chevron.packages.hasLoadedInitialPackages()) {
      this.populateLoadingViews();
    } else {
      chevron.packages.onDidLoadInitialPackages(() => this.populateLoadingViews());
    }
    if (chevron.packages.hasActivatedInitialPackages()) {
      this.populateActivationViews();
    } else {
      chevron.packages.onDidActivateInitialPackages(() => this.populateActivationViews());
    }
  }
  update() {
  }
  destroy() {
    return import_etch.default.destroy(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "timecop pane-item native-key-bindings", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "timecop-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "panels" }, /* @__PURE__ */ import_etch.default.dom(import_window_panel_view.default, { ref: "windowLoadingPanel" }), /* @__PURE__ */ import_etch.default.dom(import_cache_panel_view.default, { ref: "cacheLoadingPanel" })), /* @__PURE__ */ import_etch.default.dom("div", { className: "panels" }, /* @__PURE__ */ import_etch.default.dom(import_package_panel_view.default, { ref: "packageLoadingPanel", title: "Package Loading" }), /* @__PURE__ */ import_etch.default.dom(import_package_panel_view.default, { ref: "packageActivationPanel", title: "Package Activation" }), /* @__PURE__ */ import_etch.default.dom(import_package_panel_view.default, { ref: "themeLoadingPanel", title: "Theme Loading" }), /* @__PURE__ */ import_etch.default.dom(import_package_panel_view.default, { ref: "themeActivationPanel", title: "Theme Activation" }))));
  }
  populateLoadingViews() {
    this.showLoadedPackages();
    this.showLoadedThemes();
  }
  populateActivationViews() {
    this.refs.windowLoadingPanel.populate();
    this.showActivePackages();
    this.showActiveThemes();
  }
  showLoadedPackages() {
    const { time, count, packages } = this.getSlowPackages(
      chevron.packages.getLoadedPackages().filter((pack) => pack.getType() !== "theme"),
      "loadTime"
    );
    this.refs.packageLoadingPanel.addPackages(packages, "loadTime");
    this.refs.packageLoadingPanel.refs.summary.textContent = import_dedent.default`
      Loaded ${count} packages in ${time}ms.
      ${import_underscore_plus.default.pluralize(packages.length, "package")} took longer than 5ms to load.
    `;
  }
  showActivePackages() {
    const { time, count, packages } = this.getSlowPackages(
      chevron.packages.getActivePackages().filter((pack) => pack.getType() !== "theme"),
      "activateTime"
    );
    this.refs.packageActivationPanel.addPackages(packages, "activateTime");
    this.refs.packageActivationPanel.refs.summary.textContent = import_dedent.default`
      Activated ${count} packages in ${time}ms.
      ${import_underscore_plus.default.pluralize(packages.length, "package")} took longer than 5ms to activate.\
    `;
  }
  showLoadedThemes() {
    const { time, count, packages } = this.getSlowPackages(chevron.themes.getLoadedThemes(), "loadTime");
    this.refs.themeLoadingPanel.addPackages(packages, "loadTime");
    this.refs.themeLoadingPanel.refs.summary.textContent = import_dedent.default`
      Loaded ${count} themes in ${time}ms.
      ${import_underscore_plus.default.pluralize(packages.length, "theme")} took longer than 5ms to load.\
    `;
  }
  showActiveThemes() {
    const { time, count, packages } = this.getSlowPackages(chevron.themes.getActiveThemes(), "activateTime");
    this.refs.themeActivationPanel.addPackages(packages, "activateTime");
    this.refs.themeActivationPanel.refs.summary.textContent = import_dedent.default`
      Activated ${count} themes in ${time}ms.
      ${import_underscore_plus.default.pluralize(packages.length, "theme")} took longer than 5ms to activate.\
    `;
  }
  getSlowPackages(packages, timeKey) {
    let time = 0;
    let count = 0;
    packages = packages.filter(function(pack) {
      time += pack[timeKey];
      count++;
      return pack[timeKey] > 5;
    });
    packages.sort((pack1, pack2) => pack2[timeKey] - pack1[timeKey]);
    return { time, count, packages };
  }
  serialize() {
    return {
      deserializer: this.constructor.name,
      uri: this.getURI()
    };
  }
  getURI() {
    return this.uri;
  }
  getTitle() {
    return "Timecop";
  }
  getIconName() {
    return "dashboard";
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
