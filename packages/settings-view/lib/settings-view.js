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
var settings_view_exports = {};
__export(settings_view_exports, {
  default: () => SettingsView
});
module.exports = __toCommonJS(settings_view_exports);
var import_path = __toESM(require("path"));
var import_etch = __toESM(require("etch"));
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_atom = require("chevron");
var import_general_panel = __toESM(require("./general-panel"));
var import_editor_panel = __toESM(require("./editor-panel"));
var import_package_detail_view = __toESM(require("./package-detail-view"));
var import_keybindings_panel = __toESM(require("./keybindings-panel"));
var import_themes_panel = __toESM(require("./themes-panel"));
var import_installed_packages_panel = __toESM(require("./installed-packages-panel"));
var import_uri_handler_panel = __toESM(require("./uri-handler-panel"));
class SettingsView {
  constructor({ uri, packageManager, snippetsProvider, activePanel } = {}) {
    this.uri = uri;
    this.packageManager = packageManager;
    this.snippetsProvider = snippetsProvider;
    this.deferredPanel = activePanel;
    this.destroyed = false;
    this.panelsByName = {};
    this.panelCreateCallbacks = {};
    import_etch.default.initialize(this);
    this.disposables = new import_atom.CompositeDisposable();
    this.disposables.add(chevron.commands.add(this.element, {
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
    this.disposables.add(chevron.packages.onDidActivateInitialPackages(() => {
      this.disposables.add(
        chevron.packages.onDidActivatePackage((pack) => this.removePanelCache(pack.name)),
        chevron.packages.onDidDeactivatePackage((pack) => this.removePanelCache(pack.name))
      );
    }));
    process.nextTick(() => this.initializePanels());
  }
  removePanelCache(name) {
    delete this.panelsByName[name];
  }
  update() {
  }
  destroy() {
    this.destroyed = true;
    this.disposables.dispose();
    for (let name in this.panelsByName) {
      const panel = this.panelsByName[name];
      panel.destroy();
    }
    return import_etch.default.destroy(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "settings-view pane-item", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "config-menu", ref: "sidebar" }, /* @__PURE__ */ import_etch.default.dom("ul", { className: "panels-menu nav nav-pills nav-stacked", ref: "panelMenu" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "panel-menu-separator", ref: "menuSeparator" })), /* @__PURE__ */ import_etch.default.dom("div", { className: "button-area" }, /* @__PURE__ */ import_etch.default.dom("button", { className: "btn btn-default icon icon-link-external", ref: "openDotAtom" }, "Open Config Folder"))), /* @__PURE__ */ import_etch.default.dom("div", { className: "panels", tabIndex: "-1", ref: "panels" }));
  }
  // This prevents the view being actually disposed when closed
  // If you remove it you will need to ensure the cached settingsView
  // in main.coffee is correctly released on close as well...
  onDidChangeTitle() {
    return new import_atom.Disposable();
  }
  initializePanels() {
    if (this.refs.panels.children.length > 1) {
      return;
    }
    const clickHandler = (event) => {
      const target = event.target.closest(".panels-menu li a, .panels-packages li a");
      if (target) {
        this.showPanel(target.closest("li").name);
      }
    };
    this.element.addEventListener("click", clickHandler);
    this.disposables.add(new import_atom.Disposable(() => this.element.removeEventListener("click", clickHandler)));
    const focusHandler = () => {
      this.focusActivePanel();
    };
    this.element.addEventListener("focus", focusHandler);
    this.disposables.add(new import_atom.Disposable(() => this.element.removeEventListener("focus", focusHandler)));
    const openDotAtomClickHandler = () => {
      chevron.open({ pathsToOpen: [chevron.getConfigDirPath()] });
    };
    this.refs.openDotAtom.addEventListener("click", openDotAtomClickHandler);
    this.disposables.add(new import_atom.Disposable(() => this.refs.openDotAtom.removeEventListener("click", openDotAtomClickHandler)));
    this.addCorePanel("Core", "settings", () => new import_general_panel.default());
    this.addCorePanel("Editor", "code", () => new import_editor_panel.default());
    if (chevron.config.getSchema("core.uriHandlerRegistration").type !== "any") {
      this.addCorePanel("URI Handling", "link", () => new import_uri_handler_panel.default());
    }
    if (process.platform === "win32" && require("chevron").WinShell != null) {
      const SystemPanel = require("./system-windows-panel");
      this.addCorePanel("System", "device-desktop", () => new SystemPanel());
    }
    this.addCorePanel("Keybindings", "keyboard", () => new import_keybindings_panel.default());
    this.addCorePanel("Packages", "package", () => new import_installed_packages_panel.default(this, this.packageManager));
    this.addCorePanel("Themes", "paintcan", () => new import_themes_panel.default(this, this.packageManager));
    this.showDeferredPanel();
    if (!this.activePanel) {
      this.showPanel("Core");
    }
    if (document.body.contains(this.element)) {
      this.refs.sidebar.style.width = this.refs.sidebar.offsetWidth;
    }
  }
  serialize() {
    return {
      deserializer: "SettingsView",
      version: 2,
      activePanel: this.activePanel != null ? this.activePanel : this.deferredPanel,
      uri: this.uri
    };
  }
  getPackages() {
    let bundledPackageMetadataCache;
    if (this.packages != null) {
      return this.packages;
    }
    this.packages = chevron.packages.getLoadedPackages();
    try {
      const packageMetadata = require(import_path.default.join(chevron.getLoadSettings().resourcePath, "package.json"));
      bundledPackageMetadataCache = packageMetadata ? packageMetadata._atomPackages : null;
    } catch (error) {
    }
    const disabledPackages = chevron.config.get("core.disabledPackages") || [];
    for (const packageName of disabledPackages) {
      var metadata;
      const packagePath = chevron.packages.resolvePackagePath(packageName);
      if (!packagePath) {
        continue;
      }
      try {
        metadata = require(import_path.default.join(packagePath, "package.json"));
      } catch (error) {
        if (bundledPackageMetadataCache && bundledPackageMetadataCache[packageName]) {
          metadata = bundledPackageMetadataCache[packageName].metadata;
        }
      }
      if (metadata == null) {
        continue;
      }
      const name = metadata.name != null ? metadata.name : packageName;
      if (!import_underscore_plus.default.findWhere(this.packages, { name })) {
        this.packages.push({ name, metadata, path: packagePath });
      }
    }
    this.packages.sort((pack1, pack2) => {
      const title1 = this.packageManager.getPackageTitle(pack1);
      const title2 = this.packageManager.getPackageTitle(pack2);
      return title1.localeCompare(title2);
    });
    return this.packages;
  }
  addCorePanel(name, iconName, panelCreateCallback) {
    const panelMenuItem = document.createElement("li");
    panelMenuItem.name = name;
    panelMenuItem.setAttribute("name", name);
    const a = document.createElement("a");
    a.classList.add("icon", `icon-${iconName}`);
    a.textContent = name;
    panelMenuItem.appendChild(a);
    this.refs.menuSeparator.parentElement.insertBefore(panelMenuItem, this.refs.menuSeparator);
    this.addPanel(name, panelCreateCallback);
  }
  addPanel(name, panelCreateCallback) {
    this.panelCreateCallbacks[name] = panelCreateCallback;
    if (this.deferredPanel && this.deferredPanel.name === name) {
      this.showDeferredPanel();
    }
  }
  getOrCreatePanel(name, options) {
    let panel = this.panelsByName[name];
    if (panel) return panel;
    if (name in this.panelCreateCallbacks) {
      panel = this.panelCreateCallbacks[name]();
      delete this.panelCreateCallbacks[name];
    } else if (options && options.pack) {
      if (!options.pack.metadata) {
        options.pack.metadata = import_underscore_plus.default.clone(options.pack);
      }
      panel = new import_package_detail_view.default(options.pack, this, this.packageManager, this.snippetsProvider);
    }
    if (panel) {
      this.panelsByName[name] = panel;
    }
    return panel;
  }
  makePanelMenuActive(name) {
    const previouslyActivePanel = this.refs.sidebar.querySelector(".active");
    if (previouslyActivePanel) {
      previouslyActivePanel.classList.remove("active");
    }
    const newActivePanel = this.refs.sidebar.querySelector(`[name='${name}']`);
    if (newActivePanel) {
      newActivePanel.classList.add("active");
    }
  }
  focusActivePanel() {
    for (let i = 0; i < this.refs.panels.children.length; i++) {
      const child = this.refs.panels.children[i];
      if (child.offsetWidth > 0) {
        child.focus();
      }
    }
  }
  showDeferredPanel() {
    if (this.deferredPanel) {
      const { name, options } = this.deferredPanel;
      this.showPanel(name, options);
    }
  }
  // Public: show a panel.
  //
  // * `name` {String} the name of the panel to show
  // * `options` {Object} an options hash. Will be passed to `beforeShow()` on
  //   the panel. Options may include (but are not limited to):
  //   * `uri` the URI the panel was launched from
  showPanel(name, options) {
    const panel = this.getOrCreatePanel(name, options);
    if (panel) {
      this.appendPanel(panel, options);
      this.makePanelMenuActive(name);
      this.setActivePanel(name, options);
      this.deferredPanel = null;
    } else {
      this.deferredPanel = { name, options };
    }
  }
  showPanelForURI(uri) {
    const regex = /config\/([a-z]+)\/?([a-zA-Z0-9_-]+)?/i;
    const match = regex.exec(uri);
    if (match) {
      const path1 = match[1];
      const path2 = match[2];
      if (path1 === "packages" && path2 != null) {
        this.showPanel(path2, {
          uri,
          pack: { name: path2 },
          back: chevron.packages.getLoadedPackage(path2) ? "Packages" : null
        });
      } else {
        const panelName = path1[0].toUpperCase() + path1.slice(1);
        this.showPanel(panelName, { uri });
      }
    }
  }
  appendPanel(panel, options) {
    for (let i = 0; i < this.refs.panels.children.length; i++) {
      this.refs.panels.children[i].style.display = "none";
    }
    if (!this.refs.panels.contains(panel.element)) {
      this.refs.panels.appendChild(panel.element);
    }
    if (panel.beforeShow) {
      panel.beforeShow(options);
    }
    panel.show();
    panel.focus();
  }
  setActivePanel(name, options = {}) {
    this.activePanel = { name, options };
  }
  removePanel(name) {
    const panel = this.panelsByName[name];
    if (panel) {
      panel.destroy();
      delete this.panelsByName[name];
    }
  }
  getTitle() {
    return "Settings";
  }
  getIconName() {
    return "tools";
  }
  getURI() {
    return this.uri;
  }
  isEqual(other) {
    return other instanceof SettingsView;
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
