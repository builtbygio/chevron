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
var themes_panel_exports = {};
__export(themes_panel_exports, {
  default: () => ThemesPanel
});
module.exports = __toCommonJS(themes_panel_exports);
var import_fuzzaldrin = __toESM(require("fuzzaldrin"));
var import_etch = __toESM(require("etch"));
var import_underscore_plus = __toESM(require("underscore-plus"));
var import_atom = require("chevron");
var import_collapsible_section_panel = __toESM(require("./collapsible-section-panel"));
var import_package_card = __toESM(require("./package-card"));
var import_error_view = __toESM(require("./error-view"));
var import_list = __toESM(require("./list"));
var import_list_view = __toESM(require("./list-view"));
var import_utils = require("./utils");
class ThemesPanel extends import_collapsible_section_panel.default {
  static loadPackagesDelay() {
    return 300;
  }
  constructor(settingsView, packageManager) {
    super();
    this.settingsView = settingsView;
    this.packageManager = packageManager;
    import_etch.default.initialize(this);
    this.items = {
      dev: new import_list.default("name"),
      core: new import_list.default("name"),
      user: new import_list.default("name"),
      git: new import_list.default("name")
    };
    this.itemViews = {
      dev: new import_list_view.default(this.items.dev, this.refs.devPackages, this.createPackageCard.bind(this)),
      core: new import_list_view.default(this.items.core, this.refs.corePackages, this.createPackageCard.bind(this)),
      user: new import_list_view.default(this.items.user, this.refs.communityPackages, this.createPackageCard.bind(this)),
      git: new import_list_view.default(this.items.git, this.refs.gitPackages, this.createPackageCard.bind(this))
    };
    this.disposables = new import_atom.CompositeDisposable();
    this.disposables.add(
      this.packageManager.on("theme-install-failed theme-uninstall-failed", ({ pack, error }) => {
        this.refs.themeErrors.appendChild(new import_error_view.default(this.packageManager, error).element);
      })
    );
    this.disposables.add(this.handleEvents());
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
    this.loadPackages();
    this.disposables.add(
      this.packageManager.on("theme-installed theme-uninstalled", () => {
        let loadPackagesTimeout;
        clearTimeout(loadPackagesTimeout);
        loadPackagesTimeout = setTimeout(() => {
          this.populateThemeMenus();
          this.loadPackages();
        }, ThemesPanel.loadPackagesDelay());
      })
    );
    this.disposables.add(chevron.themes.onDidChangeActiveThemes(() => this.updateActiveThemes()));
    this.disposables.add(chevron.tooltips.add(this.refs.activeUiThemeSettings, { title: "Settings" }));
    this.disposables.add(chevron.tooltips.add(this.refs.activeSyntaxThemeSettings, { title: "Settings" }));
    this.updateActiveThemes();
    this.disposables.add(this.refs.filterEditor.onDidStopChanging(() => {
      this.matchPackages();
    }));
  }
  update() {
  }
  focus() {
    this.refs.filterEditor.element.focus();
  }
  show() {
    this.element.style.display = "";
  }
  destroy() {
    this.disposables.dispose();
    return import_etch.default.destroy(this);
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "panels-item", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section packages themes-panel" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-container" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-heading icon icon-paintcan" }, "Choose a Theme"), /* @__PURE__ */ import_etch.default.dom("div", { className: "text native-key-bindings", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("span", { className: "icon icon-question" }, "You can also style Chevron by editing "), /* @__PURE__ */ import_etch.default.dom("a", { className: "link", onclick: this.didClickOpenUserStyleSheet }, "your stylesheet")), /* @__PURE__ */ import_etch.default.dom("div", { className: "themes-picker" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "themes-picker-item control-group" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "controls" }, /* @__PURE__ */ import_etch.default.dom("label", { className: "control-label" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title themes-label text" }, "UI Theme"), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description text theme-description" }, "This styles the tabs, status bar, tree view, and dropdowns")), /* @__PURE__ */ import_etch.default.dom("div", { className: "select-container" }, /* @__PURE__ */ import_etch.default.dom("select", { ref: "uiMenu", className: "form-control", onchange: this.didChangeUiMenu.bind(this) }), /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        ref: "activeUiThemeSettings",
        className: "btn icon icon-gear active-theme-settings",
        onclick: this.didClickActiveUiThemeSettings.bind(this)
      }
    )))), /* @__PURE__ */ import_etch.default.dom("div", { className: "themes-picker-item control-group" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "controls" }, /* @__PURE__ */ import_etch.default.dom("label", { className: "control-label" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-title themes-label text" }, "Syntax Theme"), /* @__PURE__ */ import_etch.default.dom("div", { className: "setting-description text theme-description" }, "This styles the text inside the editor")), /* @__PURE__ */ import_etch.default.dom("div", { className: "select-container" }, /* @__PURE__ */ import_etch.default.dom("select", { ref: "syntaxMenu", className: "form-control", onchange: this.didChangeSyntaxMenu.bind(this) }), /* @__PURE__ */ import_etch.default.dom(
      "button",
      {
        ref: "activeSyntaxThemeSettings",
        className: "btn icon icon-gear active-syntax-settings",
        onclick: this.didClickActiveSyntaxThemeSettings.bind(this)
      }
    ))))))), /* @__PURE__ */ import_etch.default.dom("section", { className: "section" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-container" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-heading icon icon-paintcan" }, "Installed Themes", /* @__PURE__ */ import_etch.default.dom("span", { ref: "totalPackages", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { className: "editor-container" }, /* @__PURE__ */ import_etch.default.dom(import_atom.TextEditor, { ref: "filterEditor", mini: true, placeholderText: "Filter themes by name" })), /* @__PURE__ */ import_etch.default.dom("div", { ref: "themeErrors" }), /* @__PURE__ */ import_etch.default.dom("section", { className: "sub-section installed-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "communityThemesHeader", className: "sub-section-heading icon icon-paintcan" }, "Community Themes", /* @__PURE__ */ import_etch.default.dom("span", { ref: "communityCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "communityPackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "communityLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading themes…"))), /* @__PURE__ */ import_etch.default.dom("section", { className: "sub-section core-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "coreThemesHeader", className: "sub-section-heading icon icon-paintcan" }, "Core Themes", /* @__PURE__ */ import_etch.default.dom("span", { ref: "coreCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "corePackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "coreLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading themes…"))), /* @__PURE__ */ import_etch.default.dom("section", { className: "sub-section dev-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "developmentThemesHeader", className: "sub-section-heading icon icon-paintcan" }, "Development Themes", /* @__PURE__ */ import_etch.default.dom("span", { ref: "devCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "devPackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "devLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading themes…"))), /* @__PURE__ */ import_etch.default.dom("section", { className: "sub-section git-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "gitThemesHeader", className: "sub-section-heading icon icon-paintcan" }, "Git Themes", /* @__PURE__ */ import_etch.default.dom("span", { ref: "gitCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "gitPackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "gitLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading themes…"))))));
  }
  filterThemes(packages) {
    packages.dev = packages.dev.filter(({ theme }) => theme);
    packages.user = packages.user.filter(({ theme }) => theme);
    packages.core = packages.core.filter(({ theme }) => theme);
    packages.git = (packages.git || []).filter(({ theme }) => theme);
    for (let pack of packages.core) {
      if (pack.repository == null) {
        pack.repository = `https://github.com/atom/${pack.name}`;
      }
    }
    for (let packageType of ["dev", "core", "user", "git"]) {
      for (let pack of packages[packageType]) {
        pack.owner = (0, import_utils.ownerFromRepository)(pack.repository);
      }
    }
    return packages;
  }
  sortThemes(packages) {
    packages.dev.sort(import_utils.packageComparatorAscending);
    packages.core.sort(import_utils.packageComparatorAscending);
    packages.user.sort(import_utils.packageComparatorAscending);
    packages.git.sort(import_utils.packageComparatorAscending);
    return packages;
  }
  loadPackages() {
    this.packageViews = [];
    this.packageManager.getInstalled().then((packages) => {
      this.packages = this.sortThemes(this.filterThemes(packages));
      this.refs.devLoadingArea.remove();
      this.items.dev.setItems(this.packages.dev);
      this.refs.coreLoadingArea.remove();
      this.items.core.setItems(this.packages.core);
      this.refs.communityLoadingArea.remove();
      this.items.user.setItems(this.packages.user);
      this.refs.gitLoadingArea.remove();
      this.items.git.setItems(this.packages.git);
      this.updateSectionCounts();
    }).catch((error) => {
      this.refs.themeErrors.appendChild(new import_error_view.default(this.packageManager, error).element);
    });
  }
  // Update the active UI and syntax themes and populate the menu
  updateActiveThemes() {
    this.activeUiTheme = this.getActiveUiTheme();
    this.activeSyntaxTheme = this.getActiveSyntaxTheme();
    this.populateThemeMenus();
    this.toggleActiveThemeButtons();
  }
  toggleActiveThemeButtons() {
    if (this.hasSettings(this.activeUiTheme)) {
      this.refs.activeUiThemeSettings.style.display = "";
    } else {
      this.refs.activeUiThemeSettings.style.display = "none";
    }
    if (this.hasSettings(this.activeSyntaxTheme)) {
      this.refs.activeSyntaxThemeSettings.display = "";
    } else {
      this.refs.activeSyntaxThemeSettings.display = "none";
    }
  }
  hasSettings(packageName) {
    return this.packageManager.packageHasSettings(packageName);
  }
  // Populate the theme menus from the theme manager's active themes
  populateThemeMenus() {
    this.refs.uiMenu.innerHTML = "";
    this.refs.syntaxMenu.innerHTML = "";
    const availableThemes = import_underscore_plus.default.sortBy(chevron.themes.getLoadedThemes(), "name");
    for (let { name, metadata } of availableThemes) {
      switch (metadata.theme) {
        case "ui": {
          const themeItem = this.createThemeMenuItem(name);
          if (name === this.activeUiTheme) {
            themeItem.selected = true;
          }
          this.refs.uiMenu.appendChild(themeItem);
          break;
        }
        case "syntax": {
          const themeItem = this.createThemeMenuItem(name);
          if (name === this.activeSyntaxTheme) {
            themeItem.selected = true;
          }
          this.refs.syntaxMenu.appendChild(themeItem);
          break;
        }
      }
    }
  }
  // Get the name of the active ui theme.
  getActiveUiTheme() {
    for (let { name, metadata } of chevron.themes.getActiveThemes()) {
      if (metadata.theme === "ui") {
        return name;
      }
    }
    return null;
  }
  // Get the name of the active syntax theme.
  getActiveSyntaxTheme() {
    for (let { name, metadata } of chevron.themes.getActiveThemes()) {
      if (metadata.theme === "syntax") {
        return name;
      }
    }
    return null;
  }
  // Update the config with the selected themes
  updateThemeConfig() {
    const themes = [];
    if (this.activeUiTheme) {
      themes.push(this.activeUiTheme);
    }
    if (this.activeSyntaxTheme) {
      themes.push(this.activeSyntaxTheme);
    }
    if (themes.length > 0) {
      chevron.config.set("core.themes", themes);
    }
  }
  scheduleUpdateThemeConfig() {
    setTimeout(() => {
      this.updateThemeConfig();
    }, 100);
  }
  // Create a menu item for the given theme name.
  createThemeMenuItem(themeName) {
    const title = import_underscore_plus.default.undasherize(import_underscore_plus.default.uncamelcase(themeName.replace(/-(ui|syntax)/g, "").replace(/-theme$/g, "")));
    const option = document.createElement("option");
    option.value = themeName;
    option.textContent = title;
    return option;
  }
  createPackageCard(pack) {
    return new import_package_card.default(pack, this.settingsView, this.packageManager, { back: "Themes" });
  }
  filterPackageListByText(text) {
    if (!this.packages) {
      return;
    }
    for (let packageType of ["dev", "core", "user", "git"]) {
      const allViews = this.itemViews[packageType].getViews();
      const activeViews = this.itemViews[packageType].filterViews((pack) => {
        if (text === "") {
          return true;
        } else {
          const owner = pack.owner != null ? pack.owner : (0, import_utils.ownerFromRepository)(pack.repository);
          const filterText = `${pack.name} ${owner}`;
          return import_fuzzaldrin.default.score(filterText, text) > 0;
        }
      });
      for (const view of allViews) {
        if (view) {
          view.element.style.display = "none";
          view.element.classList.add("hidden");
        }
      }
      for (const view of activeViews) {
        if (view) {
          view.element.style.display = "";
          view.element.classList.remove("hidden");
        }
      }
    }
    this.updateSectionCounts();
  }
  updateUnfilteredSectionCounts() {
    this.updateSectionCount(this.refs.communityThemesHeader, this.refs.communityCount, this.packages.user.length);
    this.updateSectionCount(this.refs.coreThemesHeader, this.refs.coreCount, this.packages.core.length);
    this.updateSectionCount(this.refs.developmentThemesHeader, this.refs.devCount, this.packages.dev.length);
    this.updateSectionCount(this.refs.gitThemesHeader, this.refs.gitCount, this.packages.git.length);
    this.refs.totalPackages.textContent = `${this.packages.user.length + this.packages.core.length + this.packages.dev.length + this.packages.git.length}`;
  }
  updateFilteredSectionCounts() {
    const community = this.notHiddenCardsLength(this.refs.communityPackages);
    this.updateSectionCount(this.refs.communityThemesHeader, this.refs.communityCount, community, this.packages.user.length);
    const dev = this.notHiddenCardsLength(this.refs.devPackages);
    this.updateSectionCount(this.refs.developmentThemesHeader, this.refs.devCount, dev, this.packages.dev.length);
    const core = this.notHiddenCardsLength(this.refs.corePackages);
    this.updateSectionCount(this.refs.coreThemesHeader, this.refs.coreCount, core, this.packages.core.length);
    const git = this.notHiddenCardsLength(this.refs.gitPackages);
    this.updateSectionCount(this.refs.gitThemesHeader, this.refs.gitCount, git, this.packages.git.length);
    const shownThemes = dev + core + community + git;
    const totalThemes = this.packages.user.length + this.packages.core.length + this.packages.dev.length + this.packages.git.length;
    this.refs.totalPackages.textContent = `${shownThemes}/${totalThemes}`;
  }
  resetSectionHasItems() {
    this.resetCollapsibleSections([this.refs.communityThemesHeader, this.refs.coreThemesHeader, this.refs.developmentThemesHeader, this.refs.gitThemesHeader]);
  }
  matchPackages() {
    this.filterPackageListByText(this.refs.filterEditor.getText());
  }
  didClickOpenUserStyleSheet(e) {
    e.preventDefault();
    chevron.commands.dispatch(chevron.views.getView(chevron.workspace), "application:open-your-stylesheet");
  }
  didChangeUiMenu() {
    this.activeUiTheme = this.refs.uiMenu.value;
    this.scheduleUpdateThemeConfig();
  }
  didChangeSyntaxMenu() {
    this.activeSyntaxTheme = this.refs.syntaxMenu.value;
    this.scheduleUpdateThemeConfig();
  }
  didClickActiveUiThemeSettings(event) {
    event.stopPropagation();
    const theme = chevron.themes.getActiveThemes().find((theme2) => theme2.metadata.theme === "ui");
    const activeUiTheme = theme != null ? theme.metadata : null;
    if (activeUiTheme != null) {
      this.settingsView.showPanel(this.activeUiTheme, {
        back: "Themes",
        pack: activeUiTheme
      });
    }
  }
  didClickActiveSyntaxThemeSettings(event) {
    event.stopPropagation();
    const theme = chevron.themes.getActiveThemes().find((theme2) => theme2.metadata.theme === "syntax");
    const activeSyntaxTheme = theme != null ? theme.metadata : null;
    if (activeSyntaxTheme != null) {
      this.settingsView.showPanel(this.activeSyntaxTheme, {
        back: "Themes",
        pack: activeSyntaxTheme
      });
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
