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
var installed_packages_panel_exports = {};
__export(installed_packages_panel_exports, {
  default: () => InstalledPackagesPanel
});
module.exports = __toCommonJS(installed_packages_panel_exports);
var import_atom = require("chevron");
var import_etch = __toESM(require("etch"));
var import_fuzzaldrin = __toESM(require("fuzzaldrin"));
var import_collapsible_section_panel = __toESM(require("./collapsible-section-panel"));
var import_package_card = __toESM(require("./package-card"));
var import_error_view = __toESM(require("./error-view"));
var import_list = __toESM(require("./list"));
var import_list_view = __toESM(require("./list-view"));
var import_utils = require("./utils");
class InstalledPackagesPanel extends import_collapsible_section_panel.default {
  static loadPackagesDelay() {
    return 300;
  }
  constructor(settingsView, packageManager) {
    super();
    import_etch.default.initialize(this);
    this.settingsView = settingsView;
    this.packageManager = packageManager;
    this.items = {
      dev: new import_list.default("name"),
      core: new import_list.default("name"),
      user: new import_list.default("name"),
      git: new import_list.default("name"),
      deprecated: new import_list.default("name")
    };
    this.itemViews = {
      dev: new import_list_view.default(this.items.dev, this.refs.devPackages, this.createPackageCard.bind(this)),
      core: new import_list_view.default(this.items.core, this.refs.corePackages, this.createPackageCard.bind(this)),
      user: new import_list_view.default(this.items.user, this.refs.communityPackages, this.createPackageCard.bind(this)),
      git: new import_list_view.default(this.items.git, this.refs.gitPackages, this.createPackageCard.bind(this)),
      deprecated: new import_list_view.default(this.items.deprecated, this.refs.deprecatedPackages, this.createPackageCard.bind(this))
    };
    this.subscriptions = new import_atom.CompositeDisposable();
    this.subscriptions.add(
      this.refs.filterEditor.onDidStopChanging(() => {
        this.matchPackages();
      })
    );
    this.subscriptions.add(
      this.packageManager.on("package-install-failed theme-install-failed package-uninstall-failed theme-uninstall-failed package-update-failed theme-update-failed", ({ pack, error }) => {
        this.refs.updateErrors.appendChild(new import_error_view.default(this.packageManager, error).element);
      })
    );
    let loadPackagesTimeout;
    this.subscriptions.add(
      this.packageManager.on("package-updated package-installed package-uninstalled package-installed-alternative", () => {
        clearTimeout(loadPackagesTimeout);
        loadPackagesTimeout = setTimeout(this.loadPackages.bind(this), InstalledPackagesPanel.loadPackagesDelay());
      })
    );
    this.subscriptions.add(this.handleEvents());
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
    this.loadPackages();
  }
  focus() {
    this.refs.filterEditor.element.focus();
  }
  show() {
    this.element.style.display = "";
  }
  destroy() {
    this.subscriptions.dispose();
    return import_etch.default.destroy(this);
  }
  update() {
  }
  render() {
    return /* @__PURE__ */ import_etch.default.dom("div", { className: "panels-item", tabIndex: "-1" }, /* @__PURE__ */ import_etch.default.dom("section", { className: "section" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-container" }, /* @__PURE__ */ import_etch.default.dom("div", { className: "section-heading icon icon-package" }, "Installed Packages", /* @__PURE__ */ import_etch.default.dom("span", { ref: "totalPackages", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { className: "editor-container" }, /* @__PURE__ */ import_etch.default.dom(import_atom.TextEditor, { ref: "filterEditor", mini: true, placeholderText: "Filter packages by name" })), /* @__PURE__ */ import_etch.default.dom("div", { ref: "updateErrors" }), /* @__PURE__ */ import_etch.default.dom("section", { ref: "deprecatedSection", className: "sub-section deprecated-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "deprecatedPackagesHeader", className: "sub-section-heading icon icon-package" }, "Deprecated Packages", /* @__PURE__ */ import_etch.default.dom("span", { ref: "deprecatedCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("p", null, "Atom does not load deprecated packages. These packages may have updates available."), /* @__PURE__ */ import_etch.default.dom("div", { ref: "deprecatedPackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "deprecatedLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading packages…"))), /* @__PURE__ */ import_etch.default.dom("section", { className: "sub-section installed-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "communityPackagesHeader", className: "sub-section-heading icon icon-package" }, "Community Packages", /* @__PURE__ */ import_etch.default.dom("span", { ref: "communityCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "communityPackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "communityLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading packages…"))), /* @__PURE__ */ import_etch.default.dom("section", { className: "sub-section core-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "corePackagesHeader", className: "sub-section-heading icon icon-package" }, "Core Packages", /* @__PURE__ */ import_etch.default.dom("span", { ref: "coreCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "corePackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "coreLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading packages…"))), /* @__PURE__ */ import_etch.default.dom("section", { className: "sub-section dev-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "devPackagesHeader", className: "sub-section-heading icon icon-package" }, "Development Packages", /* @__PURE__ */ import_etch.default.dom("span", { ref: "devCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "devPackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "devLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading packages…"))), /* @__PURE__ */ import_etch.default.dom("section", { className: "sub-section git-packages" }, /* @__PURE__ */ import_etch.default.dom("h3", { ref: "gitPackagesHeader", className: "sub-section-heading icon icon-package" }, "Git Packages", /* @__PURE__ */ import_etch.default.dom("span", { ref: "gitCount", className: "section-heading-count badge badge-flexible" }, "…")), /* @__PURE__ */ import_etch.default.dom("div", { ref: "gitPackages", className: "container package-container" }, /* @__PURE__ */ import_etch.default.dom("div", { ref: "gitLoadingArea", className: "alert alert-info loading-area icon icon-hourglass" }, "Loading packages…"))))));
  }
  filterPackages(packages) {
    packages.dev = packages.dev.filter(({ theme }) => !theme);
    packages.user = packages.user.filter(({ theme }) => !theme);
    packages.deprecated = packages.user.filter(({ name, version }) => chevron.packages.isDeprecatedPackage(name, version));
    packages.core = packages.core.filter(({ theme }) => !theme);
    packages.git = (packages.git || []).filter(({ theme }) => !theme);
    for (let pack of packages.core) {
      if (pack.repository == null) {
        pack.repository = `https://github.com/atom/${pack.name}`;
      }
    }
    for (let packageType of ["dev", "core", "user", "git", "deprecated"]) {
      for (let pack of packages[packageType]) {
        pack.owner = (0, import_utils.ownerFromRepository)(pack.repository);
      }
    }
    return packages;
  }
  sortPackages(packages) {
    packages.dev.sort(import_utils.packageComparatorAscending);
    packages.core.sort(import_utils.packageComparatorAscending);
    packages.user.sort(import_utils.packageComparatorAscending);
    packages.git.sort(import_utils.packageComparatorAscending);
    packages.deprecated.sort(import_utils.packageComparatorAscending);
    return packages;
  }
  loadPackages() {
    const packagesWithUpdates = {};
    this.packageManager.getOutdated().then((packages) => {
      for (let { name, latestVersion } of packages) {
        packagesWithUpdates[name] = latestVersion;
      }
      this.displayPackageUpdates(packagesWithUpdates);
    });
    this.packageManager.getInstalled().then((packages) => {
      this.packages = this.sortPackages(this.filterPackages(packages));
      this.refs.devLoadingArea.remove();
      this.items.dev.setItems(this.packages.dev);
      this.refs.coreLoadingArea.remove();
      this.items.core.setItems(this.packages.core);
      this.refs.communityLoadingArea.remove();
      this.items.user.setItems(this.packages.user);
      this.refs.gitLoadingArea.remove();
      this.items.git.setItems(this.packages.git);
      if (this.packages.deprecated.length) {
        this.refs.deprecatedSection.style.display = "";
      } else {
        this.refs.deprecatedSection.style.display = "none";
      }
      this.refs.deprecatedLoadingArea.remove();
      this.items.deprecated.setItems(this.packages.deprecated);
      this.updateSectionCounts();
      this.displayPackageUpdates(packagesWithUpdates);
      this.matchPackages();
    }).catch((error) => {
      console.error(error.message, error.stack);
    });
  }
  displayPackageUpdates(packagesWithUpdates) {
    for (const packageType of ["dev", "core", "user", "git", "deprecated"]) {
      for (const packageCard of this.itemViews[packageType].getViews()) {
        const newVersion = packagesWithUpdates[packageCard.pack.name];
        if (newVersion) {
          packageCard.displayAvailableUpdate(newVersion);
        }
      }
    }
  }
  createPackageCard(pack) {
    return new import_package_card.default(pack, this.settingsView, this.packageManager, { back: "Packages" });
  }
  filterPackageListByText(text) {
    if (!this.packages) {
      return;
    }
    for (let packageType of ["dev", "core", "user", "git", "deprecated"]) {
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
    this.updateSectionCount(this.refs.deprecatedPackagesHeader, this.refs.deprecatedCount, this.packages.deprecated.length);
    this.updateSectionCount(this.refs.communityPackagesHeader, this.refs.communityCount, this.packages.user.length);
    this.updateSectionCount(this.refs.corePackagesHeader, this.refs.coreCount, this.packages.core.length);
    this.updateSectionCount(this.refs.devPackagesHeader, this.refs.devCount, this.packages.dev.length);
    this.updateSectionCount(this.refs.gitPackagesHeader, this.refs.gitCount, this.packages.git.length);
    const totalPackages = this.packages.user.length + this.packages.core.length + this.packages.dev.length + this.packages.git.length;
    this.refs.totalPackages.textContent = totalPackages.toString();
  }
  updateFilteredSectionCounts() {
    const deprecated = this.notHiddenCardsLength(this.refs.deprecatedPackages);
    this.updateSectionCount(this.refs.deprecatedPackagesHeader, this.refs.deprecatedCount, deprecated, this.packages.deprecated.length);
    const community = this.notHiddenCardsLength(this.refs.communityPackages);
    this.updateSectionCount(this.refs.communityPackagesHeader, this.refs.communityCount, community, this.packages.user.length);
    const core = this.notHiddenCardsLength(this.refs.corePackages);
    this.updateSectionCount(this.refs.corePackagesHeader, this.refs.coreCount, core, this.packages.core.length);
    const dev = this.notHiddenCardsLength(this.refs.devPackages);
    this.updateSectionCount(this.refs.devPackagesHeader, this.refs.devCount, dev, this.packages.dev.length);
    const git = this.notHiddenCardsLength(this.refs.gitPackages);
    this.updateSectionCount(this.refs.gitPackagesHeader, this.refs.gitCount, git, this.packages.git.length);
    const shownPackages = dev + core + community + git;
    const totalPackages = this.packages.user.length + this.packages.core.length + this.packages.dev.length + this.packages.git.length;
    this.refs.totalPackages.textContent = `${shownPackages}/${totalPackages}`;
  }
  resetSectionHasItems() {
    this.resetCollapsibleSections([this.refs.deprecatedPackagesHeader, this.refs.communityPackagesHeader, this.refs.corePackagesHeader, this.refs.devPackagesHeader, this.refs.gitPackagesHeader]);
  }
  matchPackages() {
    this.filterPackageListByText(this.refs.filterEditor.getText());
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
